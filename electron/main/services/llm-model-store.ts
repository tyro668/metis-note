import { randomUUID } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { getMessages, type AppLocale } from "../../../src/shared/i18n"
import {
  DEFAULT_MANAGED_LOCAL_ENDPOINT,
  MANAGED_LOCAL_PROVIDER_ID,
  MANAGED_LOCAL_PROVIDER_LABEL,
  getLegacyProviderDefault,
  getManagedLocalModelDefinition,
  getPresetDefinition,
  getProtocolDefaultEndpoint,
  getProtocolLabel,
  isLlmProtocolId,
  isManagedLocalModelStatus,
  normalizeEndpoint,
  resolveRequestModelName,
  type LlmConnectionResult,
  type LlmConfigType,
  type LlmModelConfig,
  type LlmProtocolId,
  type SaveLlmModelInput,
  type StoredLlmModelsPayload,
} from "../../../src/shared/llm"

interface ManagedLocalSyncPatch {
  identifier?: string
  endpoint?: string
  enabled?: boolean
  customModelName?: string | null
  installedArtifactId?: string | null
  managedStatus?: LlmModelConfig["managedStatus"]
  managedProgress?: number | null
  managedDownloadedBytes?: number | null
  managedTotalBytes?: number | null
  managedStatusMessage?: string | null
}

export class LlmModelStore {
  private readonly filePath: string
  private readonly messages
  private initialized = false

  constructor(private readonly baseDir: string, locale: AppLocale) {
    this.filePath = path.join(baseDir, "llm-models.json")
    this.messages = getMessages(locale).settings.intelligence
  }

  async ensureReady() {
    if (this.initialized) {
      return
    }

    await mkdir(this.baseDir, { recursive: true })

    try {
      await stat(this.filePath)
    } catch {
      await this.writePayload({
        version: 4,
        models: [],
      })
    }

    this.initialized = true
  }

  async list() {
    await this.ensureReady()

    return this.readModels()
  }

  async get(id: string) {
    await this.ensureReady()
    const models = await this.readModels()

    return models.find((model) => model.id === id) ?? null
  }

  async getManagedLocal(modelId: string) {
    await this.ensureReady()
    const models = await this.readModels()

    return models.find((model) => model.configType === "managed-local" && model.managedModelId === modelId) ?? null
  }

  async create(input: SaveLlmModelInput) {
    await this.ensureReady()
    const models = await this.readModels()
    const normalized = this.normalizeInput(input, models)
    const now = new Date().toISOString()
    const created: LlmModelConfig = {
      id: randomUUID(),
      ...normalized,
      enabled: false,
      managedModelId: null,
      installedArtifactId: null,
      managedStatus: null,
      managedProgress: null,
      managedDownloadedBytes: null,
      managedTotalBytes: null,
      managedStatusMessage: null,
      createdAt: now,
      updatedAt: now,
    }

    await this.writeModels([created, ...models])

    return created
  }

  async addManagedLocal(modelId: string) {
    return this.syncManagedLocal(modelId, {
      managedStatus: "preparing",
      managedProgress: 0,
      managedDownloadedBytes: 0,
      managedTotalBytes: null,
      managedStatusMessage: null,
    })
  }

  async syncManagedLocal(modelId: string, patch: ManagedLocalSyncPatch = {}) {
    await this.ensureReady()
    const models = await this.readModels()
    const definition = getManagedLocalModelDefinition(modelId)

    if (!definition) {
      throw new Error(this.messages.errors.localCatalogNotFound(modelId))
    }

    const existing = models.find((model) => model.configType === "managed-local" && model.managedModelId === modelId)
    const now = new Date().toISOString()
    const nextManagedStatus =
      patch.managedStatus ??
      existing?.managedStatus ??
      (patch.enabled ? "in-use" : "preparing")
    const nextEnabled = patch.enabled ?? existing?.enabled ?? false
    const base: LlmModelConfig =
      existing ??
      {
        id: randomUUID(),
        identifier: patch.identifier?.trim() || this.buildManagedLocalIdentifier(modelId),
        configType: "managed-local",
        provider: MANAGED_LOCAL_PROVIDER_ID,
        providerLabel: MANAGED_LOCAL_PROVIDER_LABEL,
        protocol: "openai",
        endpoint: patch.endpoint?.trim() || DEFAULT_MANAGED_LOCAL_ENDPOINT,
        presetId: null,
        customModelName: definition.filename.replace(/\.gguf$/i, ""),
        apiKey: "",
        enabled: false,
        managedModelId: modelId,
        installedArtifactId: patch.installedArtifactId ?? this.buildManagedArtifactId(modelId),
        managedStatus: "preparing",
        managedProgress: 0,
        managedDownloadedBytes: 0,
        managedTotalBytes: null,
        managedStatusMessage: null,
        createdAt: now,
        updatedAt: now,
      }

    const updated: LlmModelConfig = {
      ...base,
      identifier: patch.identifier?.trim() || base.identifier,
      endpoint: normalizeEndpoint(patch.endpoint) || base.endpoint || DEFAULT_MANAGED_LOCAL_ENDPOINT,
      customModelName: patch.customModelName === undefined ? base.customModelName : patch.customModelName,
      enabled: nextEnabled,
      installedArtifactId: patch.installedArtifactId === undefined ? base.installedArtifactId : patch.installedArtifactId,
      managedStatus:
        nextEnabled && nextManagedStatus !== "attention" && nextManagedStatus !== "starting" ? "in-use" : nextManagedStatus,
      managedProgress:
        patch.managedProgress === undefined ? base.managedProgress : this.normalizeProgress(patch.managedProgress),
      managedDownloadedBytes:
        patch.managedDownloadedBytes === undefined ? base.managedDownloadedBytes : this.normalizeByteCount(patch.managedDownloadedBytes),
      managedTotalBytes:
        patch.managedTotalBytes === undefined ? base.managedTotalBytes : this.normalizeByteCount(patch.managedTotalBytes),
      managedStatusMessage:
        patch.managedStatusMessage === undefined
          ? base.managedStatusMessage
          : patch.managedStatusMessage?.trim()
            ? patch.managedStatusMessage.trim()
            : null,
      updatedAt: now,
    }

    const nextModels: LlmModelConfig[] = models.map((model): LlmModelConfig => {
      if (model.id === updated.id) {
        return updated
      }

      if (updated.enabled) {
        if (model.configType === "managed-local") {
          const managedStatus: LlmModelConfig["managedStatus"] = model.managedStatus === "attention" ? "attention" : "ready"

          return {
            ...model,
            enabled: false,
            managedStatus,
            updatedAt: model.enabled ? now : model.updatedAt,
          }
        }

        return {
          ...model,
          enabled: false,
          updatedAt: model.enabled ? now : model.updatedAt,
        }
      }

      return model
    })

    const withUpdated = existing ? nextModels : [updated, ...nextModels]
    await this.writeModels(withUpdated)

    return updated
  }

  async update(id: string, input: SaveLlmModelInput) {
    await this.ensureReady()
    const models = await this.readModels()
    const current = models.find((model) => model.id === id)

    if (!current) {
      throw new Error(this.messages.errors.modelNotFound(id))
    }

    const normalized = this.normalizeInput(input, models, id)
    const updated: LlmModelConfig = {
      ...current,
      ...normalized,
      updatedAt: new Date().toISOString(),
    }

    await this.writeModels(models.map((model) => (model.id === id ? updated : model)))

    return updated
  }

  async enable(id: string) {
    await this.ensureReady()
    const models = await this.readModels()
    const target = models.find((model) => model.id === id)

    if (!target) {
      throw new Error(this.messages.errors.modelNotFound(id))
    }

    const updatedAt = new Date().toISOString()
    const nextModels = models.map((model) => {
      const isTarget = model.id === id
      const nextManagedStatus: LlmModelConfig["managedStatus"] =
        model.configType === "managed-local"
          ? isTarget
            ? model.managedStatus === "attention"
              ? "attention"
              : "in-use"
            : model.managedStatus === "attention"
              ? "attention"
              : "ready"
          : null

      return {
        ...model,
        enabled: isTarget,
        managedStatus: nextManagedStatus,
        updatedAt: isTarget || model.enabled ? updatedAt : model.updatedAt,
      }
    })

    await this.writeModels(nextModels)

    return nextModels.find((model) => model.id === id) ?? target
  }

  async delete(id: string) {
    await this.ensureReady()
    const models = await this.readModels()
    const target = models.find((model) => model.id === id)

    if (!target) {
      throw new Error(this.messages.errors.modelNotFound(id))
    }

    await this.writeModels(models.filter((model) => model.id !== id))

    return target
  }

  async testConnection(id: string): Promise<LlmConnectionResult> {
    await this.ensureReady()
    const models = await this.readModels()
    const target = models.find((model) => model.id === id)

    if (!target) {
      throw new Error(this.messages.errors.modelNotFound(id))
    }

    const modelName = resolveRequestModelName(target)
    const endpoint = this.resolveModelEndpoint(target)

    if (!modelName) {
      throw new Error(
        target.configType === "builtin" ? this.messages.errors.invalidPreset : this.messages.errors.missingModelName,
      )
    }

    if (!endpoint) {
      throw new Error(this.messages.errors.missingEndpoint)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12_000)

    try {
      const response =
        target.protocol === "anthropic"
          ? await this.sendAnthropicPing(target, modelName, endpoint, controller.signal)
          : await this.sendOpenAiPing(target, modelName, endpoint, controller.signal)

      if (!response.ok) {
        throw new Error(await this.readResponseError(response))
      }

      return {
        ok: true,
        message: this.messages.notices.testSucceeded(target.identifier),
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`${this.messages.errors.testFailed}: ${error.message}`)
      }

      throw new Error(this.messages.errors.testFailed)
    } finally {
      clearTimeout(timeout)
    }
  }

  private async readModels() {
    const payload = await this.readPayload()

    return this.sortModels(payload.models)
  }

  private async writeModels(models: LlmModelConfig[]) {
    await this.writePayload({
      version: 4,
      models: this.sortModels(models),
    })
  }

  private async readPayload(): Promise<StoredLlmModelsPayload> {
    const raw = await readFile(this.filePath, "utf-8")
    const parsed = JSON.parse(raw) as Partial<StoredLlmModelsPayload>

    return {
      version: 4,
      models: Array.isArray(parsed.models) ? parsed.models.map((model) => this.normalizeStoredModel(model)) : [],
    }
  }

  private async writePayload(payload: StoredLlmModelsPayload) {
    await writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf-8")
  }

  private normalizeStoredModel(model: Partial<LlmModelConfig> & { configType?: LlmConfigType | "llamacpp" }): LlmModelConfig {
    const configType = this.normalizeConfigType(model.configType)
    const provider = this.normalizeStoredProvider(model.provider, configType)
    const presetId = typeof model.presetId === "string" && model.presetId.trim() ? model.presetId.trim() : null
    const preset = configType === "builtin" ? getPresetDefinition(provider, presetId) : null
    const legacyProvider = getLegacyProviderDefault(provider)
    const protocol = this.normalizeStoredProtocol(model.protocol, configType, preset?.protocol, legacyProvider?.protocol)
    const managedModelId =
      configType === "managed-local" && typeof model.managedModelId === "string" && model.managedModelId.trim()
        ? model.managedModelId.trim()
        : null
    const managedDefinition = getManagedLocalModelDefinition(managedModelId)
    const endpoint =
      normalizeEndpoint(
        typeof model.endpoint === "string" && model.endpoint.trim()
          ? model.endpoint
          : preset?.endpoint ??
              (configType === "managed-local"
                ? DEFAULT_MANAGED_LOCAL_ENDPOINT
                : legacyProvider?.endpoint ?? getProtocolDefaultEndpoint(protocol)),
      ) || (configType === "managed-local" ? DEFAULT_MANAGED_LOCAL_ENDPOINT : getProtocolDefaultEndpoint(protocol))

    const enabled = Boolean(model.enabled)
    const customModelName =
      typeof model.customModelName === "string" && model.customModelName.trim()
        ? model.customModelName.trim()
        : configType === "managed-local"
          ? managedDefinition?.filename.replace(/\.gguf$/i, "") ?? null
          : null

    const managedDownloadedBytes =
      configType === "managed-local" ? this.normalizeByteCount(model.managedDownloadedBytes) : null
    const managedTotalBytes = configType === "managed-local" ? this.normalizeByteCount(model.managedTotalBytes) : null
    const managedProgress =
      configType === "managed-local"
        ? this.normalizeStoredProgress(model.managedProgress, managedDownloadedBytes, managedTotalBytes, enabled)
        : null

    return {
      id: typeof model.id === "string" && model.id.trim() ? model.id : randomUUID(),
      identifier:
        typeof model.identifier === "string" && model.identifier.trim()
          ? model.identifier.trim()
          : configType === "managed-local"
            ? this.buildManagedLocalIdentifier(managedModelId)
            : "",
      configType,
      provider,
      providerLabel:
        configType === "managed-local"
          ? MANAGED_LOCAL_PROVIDER_LABEL
          : typeof model.providerLabel === "string" && model.providerLabel.trim()
            ? model.providerLabel.trim()
            : preset?.providerLabel ?? legacyProvider?.label ?? getProtocolLabel(protocol),
      protocol,
      endpoint,
      presetId,
      customModelName,
      apiKey: configType === "managed-local" ? "" : typeof model.apiKey === "string" ? model.apiKey.trim() : "",
      enabled,
      managedModelId,
      installedArtifactId:
        configType === "managed-local"
          ? typeof model.installedArtifactId === "string" && model.installedArtifactId.trim()
            ? model.installedArtifactId.trim()
            : managedModelId
              ? this.buildManagedArtifactId(managedModelId)
              : null
          : null,
      managedStatus:
        configType === "managed-local" ? this.normalizeManagedStatus(model.managedStatus, enabled) : null,
      managedProgress,
      managedDownloadedBytes,
      managedTotalBytes,
      managedStatusMessage:
        configType === "managed-local" && typeof model.managedStatusMessage === "string" && model.managedStatusMessage.trim()
          ? model.managedStatusMessage.trim()
          : null,
      createdAt: typeof model.createdAt === "string" && model.createdAt ? model.createdAt : new Date().toISOString(),
      updatedAt: typeof model.updatedAt === "string" && model.updatedAt ? model.updatedAt : new Date().toISOString(),
    }
  }

  private normalizeInput(input: SaveLlmModelInput, models: LlmModelConfig[], currentId?: string) {
    const identifier = input.identifier.trim()

    if (!identifier) {
      throw new Error(this.messages.errors.missingIdentifier)
    }

    const duplicate = models.find(
      (model) => model.id !== currentId && model.identifier.trim().toLowerCase() === identifier.toLowerCase(),
    )

    if (duplicate) {
      throw new Error(this.messages.errors.duplicateIdentifier(identifier))
    }

    if (input.configType === "builtin") {
      const provider = input.provider.trim()
      const presetId = input.presetId?.trim() ?? ""
      const apiKey = input.apiKey?.trim() ?? ""

      if (!provider) {
        throw new Error(this.messages.errors.missingProvider)
      }

      if (!presetId) {
        throw new Error(this.messages.errors.missingPreset)
      }

      const preset = getPresetDefinition(provider, presetId)

      if (!apiKey) {
        throw new Error(this.messages.errors.missingApiKey)
      }

      if (!preset) {
        const legacyProvider = getLegacyProviderDefault(provider)
        const protocol = isLlmProtocolId(input.protocol) ? input.protocol : legacyProvider?.protocol ?? null
        const endpoint = normalizeEndpoint(input.endpoint) || (legacyProvider?.endpoint ?? "")

        if (!protocol || !endpoint) {
          throw new Error(this.messages.errors.invalidPreset)
        }

        return {
          identifier,
          configType: "builtin" as const,
          provider,
          providerLabel: legacyProvider?.label ?? provider,
          protocol,
          endpoint,
          presetId,
          customModelName: null,
          apiKey,
        }
      }

      return {
        identifier,
        configType: "builtin" as const,
        provider,
        providerLabel: preset.providerLabel,
        protocol: preset.protocol,
        endpoint: preset.endpoint,
        presetId,
        customModelName: null,
        apiKey,
      }
    }

    const customModelName = input.customModelName?.trim() ?? ""

    if (!customModelName) {
      throw new Error(this.messages.errors.missingModelName)
    }

    const protocol = isLlmProtocolId(input.protocol) ? input.protocol : null
    const endpoint = normalizeEndpoint(input.endpoint)
    const apiKey = input.apiKey?.trim() ?? ""

    if (!protocol) {
      throw new Error(this.messages.errors.missingProtocol)
    }

    if (!endpoint) {
      throw new Error(this.messages.errors.missingEndpoint)
    }

    if (!apiKey) {
      throw new Error(this.messages.errors.missingApiKey)
    }

    return {
      identifier,
      configType: "custom" as const,
      provider: protocol,
      providerLabel: getProtocolLabel(protocol),
      protocol,
      endpoint,
      presetId: null,
      customModelName,
      apiKey,
    }
  }

  private normalizeConfigType(configType: LlmModelConfig["configType"] | "llamacpp" | undefined): LlmConfigType {
    if (configType === "custom" || configType === "managed-local") {
      return configType
    }

    if (configType === "llamacpp") {
      return "managed-local"
    }

    return "builtin"
  }

  private normalizeStoredProvider(provider: string | undefined, configType: LlmConfigType) {
    if (configType === "managed-local") {
      return MANAGED_LOCAL_PROVIDER_ID
    }

    if (typeof provider === "string" && provider.trim()) {
      return provider.trim()
    }

    return "openai"
  }

  private normalizeStoredProtocol(
    protocol: LlmModelConfig["protocol"] | undefined,
    configType: LlmConfigType,
    presetProtocol?: LlmProtocolId,
    legacyProtocol?: LlmProtocolId,
  ) {
    if (configType === "managed-local") {
      return "openai"
    }

    if (isLlmProtocolId(protocol)) {
      return protocol
    }

    return presetProtocol ?? legacyProtocol ?? "openai"
  }

  private normalizeManagedStatus(rawStatus: LlmModelConfig["managedStatus"] | undefined, enabled: boolean) {
    if (enabled) {
      return "in-use" as const
    }

    if (isManagedLocalModelStatus(rawStatus) && rawStatus !== "in-use" && rawStatus !== "not-installed") {
      return rawStatus
    }

    return "ready" as const
  }

  private normalizeProgress(value: number | null | undefined) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return null
    }

    if (value <= 0) {
      return 0
    }

    if (value >= 1) {
      return 1
    }

    return value
  }

  private normalizeByteCount(value: number | null | undefined) {
    if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
      return null
    }

    return value
  }

  private normalizeStoredProgress(
    progress: number | null | undefined,
    downloadedBytes: number | null,
    totalBytes: number | null,
    enabled: boolean,
  ) {
    const normalized = this.normalizeProgress(progress)

    if (normalized !== null) {
      return normalized
    }

    if (enabled) {
      return 1
    }

    if (downloadedBytes !== null && totalBytes && totalBytes > 0) {
      return Math.min(1, Math.max(0, downloadedBytes / totalBytes))
    }

    return null
  }

  private sortModels(models: LlmModelConfig[]) {
    return [...models].sort((left, right) => {
      if (left.enabled !== right.enabled) {
        return left.enabled ? -1 : 1
      }

      if (left.configType !== right.configType) {
        return left.configType === "managed-local" ? -1 : 1
      }

      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    })
  }

  private resolveModelEndpoint(model: Pick<LlmModelConfig, "configType" | "provider" | "protocol" | "endpoint">) {
    const normalized = normalizeEndpoint(model.endpoint)

    if (normalized) {
      return normalized
    }

    if (model.configType === "managed-local" || model.provider === MANAGED_LOCAL_PROVIDER_ID) {
      return DEFAULT_MANAGED_LOCAL_ENDPOINT
    }

    return getLegacyProviderDefault(model.provider)?.endpoint ?? getProtocolDefaultEndpoint(model.protocol)
  }

  private buildManagedArtifactId(modelId: string) {
    return `artifact-${modelId}`
  }

  private buildManagedLocalIdentifier(modelId: string | null) {
    return modelId ? `local-${modelId}` : `local-${randomUUID().slice(0, 8)}`
  }

  private buildEndpointUrl(endpoint: string, resourcePath: string) {
    const normalized = normalizeEndpoint(endpoint)

    if (!normalized) {
      return ""
    }

    return normalized.endsWith(`/${resourcePath}`) ? normalized : `${normalized}/${resourcePath}`
  }

  private sendOpenAiPing(
    model: Pick<LlmModelConfig, "apiKey">,
    modelName: string,
    endpoint: string,
    signal: AbortSignal,
  ) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (model.apiKey.trim()) {
      headers.Authorization = `Bearer ${model.apiKey}`
    }

    return fetch(this.buildEndpointUrl(endpoint, "chat/completions"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: "user",
            content: "ping",
          },
        ],
        max_tokens: 1,
      }),
      signal,
    })
  }

  private sendAnthropicPing(
    model: Pick<LlmModelConfig, "apiKey">,
    modelName: string,
    endpoint: string,
    signal: AbortSignal,
  ) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    }

    if (model.apiKey.trim()) {
      headers["x-api-key"] = model.apiKey
    }

    return fetch(this.buildEndpointUrl(endpoint, "messages"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelName,
        max_tokens: 1,
        messages: [
          {
            role: "user",
            content: "ping",
          },
        ],
      }),
      signal,
    })
  }

  private async readResponseError(response: Response) {
    try {
      const payload = (await response.json()) as {
        error?: {
          message?: string
        }
        message?: string
      }

      return payload.error?.message || payload.message || `${response.status} ${response.statusText}`
    } catch {
      return `${response.status} ${response.statusText}`
    }
  }
}
