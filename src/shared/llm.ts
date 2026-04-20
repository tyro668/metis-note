import builtinModelCatalog from "../../design/model/builtin-models.json"
import localModelDesignCatalog from "../../design/model/local-model-design.json"

export type LlmConfigType = "builtin" | "custom" | "managed-local"
export type LlmRemoteConfigType = Exclude<LlmConfigType, "managed-local">
export type LlmProtocolId = "openai" | "anthropic"
export type ManagedLocalModelStatus =
  | "not-installed"
  | "preparing"
  | "downloading"
  | "installing"
  | "starting"
  | "ready"
  | "in-use"
  | "attention"

interface BuiltinCatalogModel {
  presetId: string
  displayName: string
  apiModel: string
  protocol: string
  endpoint: string
  enabled: boolean
}

interface BuiltinCatalogProvider {
  providerId: string
  providerName: string
  models: BuiltinCatalogModel[]
}

interface BuiltinCatalogPayload {
  version: number
  protocols: string[]
  providers: BuiltinCatalogProvider[]
}

interface LocalModelCatalogPayload {
  version: number
  initialDownloads: ManagedLocalModelCatalogEntry[]
}

interface ManagedLocalModelCatalogDownloadSourceEntry {
  id?: string
  label?: string
  communityLabel?: string
  pageUrl?: string
  downloadUrl?: string
}

interface ManagedLocalModelCatalogEntry {
  id: string
  displayName: string
  family: string
  parameterSize: string
  qualityTier: string
  recommended?: boolean
  defaultForMostUsers?: boolean
  recommendedWhenResourcesAllow?: boolean
  oneClickActionLabel?: string
  format: string
  quantization: string
  publisher: string
  repository: string
  repositoryPage: string
  filename: string
  downloadUrl: string
  downloadSources?: ManagedLocalModelCatalogDownloadSourceEntry[]
  license: string
  contextLength: number
  estimatedDownloadSizeGiB: number
  estimatedRuntimeMemoryGiB: number
  verifiedAt: string
  fallbackRepositories?: string[]
  notes?: string[]
}

export interface ManagedLocalModelDownloadSource {
  id: string
  label: string
  communityLabel: string | null
  pageUrl: string
  downloadUrl: string
}

export interface ManagedLocalModelDefinition {
  id: string
  displayName: string
  family: string
  parameterSize: string
  qualityTier: string
  recommended: boolean
  defaultForMostUsers: boolean
  recommendedWhenResourcesAllow: boolean
  oneClickActionLabel: string
  format: string
  quantization: string
  publisher: string
  repository: string
  repositoryPage: string
  filename: string
  downloadUrl: string
  downloadSources: ManagedLocalModelDownloadSource[]
  license: string
  contextLength: number
  estimatedDownloadSizeGiB: number
  estimatedRuntimeMemoryGiB: number
  verifiedAt: string
  fallbackRepositories: string[]
  notes: string[]
}

export interface LlmProviderPreset {
  id: string
  label: string
  model: string
  protocol: LlmProtocolId
  endpoint: string
  providerId: string
  providerLabel: string
}

export interface LlmProviderDefinition {
  id: string
  label: string
  presets: LlmProviderPreset[]
}

export interface LlmModelConfig {
  id: string
  identifier: string
  configType: LlmConfigType
  provider: string
  providerLabel: string
  protocol: LlmProtocolId
  endpoint: string
  presetId: string | null
  customModelName: string | null
  apiKey: string
  enabled: boolean
  managedModelId: string | null
  installedArtifactId: string | null
  managedStatus: ManagedLocalModelStatus | null
  managedProgress: number | null
  managedDownloadedBytes: number | null
  managedTotalBytes: number | null
  managedStatusMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface SaveLlmModelInput {
  identifier: string
  configType: LlmRemoteConfigType
  provider: string
  presetId?: string | null
  customModelName?: string | null
  protocol?: LlmProtocolId | null
  endpoint?: string | null
  apiKey?: string | null
}

export interface LlmConnectionResult {
  ok: boolean
  message: string
}

export interface LlmStreamChatParams {
  systemPrompt: string
  userPrompt: string
}

export interface LlmStreamStartResult {
  streamId: string
}

export interface LlmStreamChunkPayload {
  streamId: string
  chunk: string
}

export interface LlmStreamEndPayload {
  streamId: string
}

export interface LlmStreamErrorPayload {
  streamId: string
  error: string
}

export interface StoredLlmModelsPayload {
  version: 4
  models: LlmModelConfig[]
}

export const MANAGED_LOCAL_PROVIDER_ID = "managed-local"
export const MANAGED_LOCAL_PROVIDER_LABEL = "Local Model"
export const DEFAULT_MANAGED_LOCAL_ENDPOINT = "http://127.0.0.1:8080/v1"

export const LLAMA_CPP_PROVIDER_ID = MANAGED_LOCAL_PROVIDER_ID
export const LLAMA_CPP_PROVIDER_LABEL = MANAGED_LOCAL_PROVIDER_LABEL
export const DEFAULT_LLAMA_CPP_ENDPOINT = DEFAULT_MANAGED_LOCAL_ENDPOINT

const LEGACY_PROVIDER_DEFAULTS: Record<string, { label: string; protocol: LlmProtocolId; endpoint: string }> = {
  kimi: {
    label: "Kimi",
    protocol: "openai",
    endpoint: "https://api.moonshot.cn/v1",
  },
  aliyun: {
    label: "Aliyun",
    protocol: "openai",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  openai: {
    label: "OpenAI",
    protocol: "openai",
    endpoint: "https://api.openai.com/v1",
  },
  deepseek: {
    label: "DeepSeek",
    protocol: "openai",
    endpoint: "https://api.deepseek.com/v1",
  },
  anthropic: {
    label: "Anthropic",
    protocol: "anthropic",
    endpoint: "https://api.anthropic.com/v1",
  },
}

const PROTOCOL_LABELS: Record<LlmProtocolId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
}

const PROTOCOL_DEFAULT_ENDPOINTS: Record<LlmProtocolId, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
}

export const LLM_PROTOCOL_ORDER = ["openai", "anthropic"] as const satisfies readonly LlmProtocolId[]

const builtinCatalogPayload = builtinModelCatalog as BuiltinCatalogPayload
const localModelCatalogPayload = localModelDesignCatalog as LocalModelCatalogPayload

const builtinProviders = builtinCatalogPayload.providers.map<LlmProviderDefinition>((provider) => ({
  id: provider.providerId,
  label: provider.providerName,
  presets: provider.models
    .filter((model) => model.enabled)
    .map((model) => ({
      id: model.presetId,
      label: model.displayName,
      model: model.apiModel,
      protocol: normalizeProtocol(model.protocol),
      endpoint: normalizeEndpoint(model.endpoint),
      providerId: provider.providerId,
      providerLabel: provider.providerName,
    })),
}))

const builtinProviderMap = new Map(builtinProviders.map((provider) => [provider.id, provider]))

const managedLocalModelDefinitions = (Array.isArray(localModelCatalogPayload.initialDownloads)
  ? localModelCatalogPayload.initialDownloads
  : []
).map<ManagedLocalModelDefinition>((entry) => ({
  id: entry.id,
  displayName: entry.displayName,
  family: entry.family,
  parameterSize: entry.parameterSize,
  qualityTier: entry.qualityTier,
  recommended: entry.recommended ?? false,
  defaultForMostUsers: entry.defaultForMostUsers ?? false,
  recommendedWhenResourcesAllow: entry.recommendedWhenResourcesAllow ?? false,
  oneClickActionLabel: entry.oneClickActionLabel ?? "Add & Download",
  format: entry.format,
  quantization: entry.quantization,
  publisher: entry.publisher,
  repository: entry.repository,
  repositoryPage: entry.repositoryPage,
  filename: entry.filename,
  downloadUrl: entry.downloadUrl,
  downloadSources: normalizeManagedLocalDownloadSources(entry),
  license: entry.license,
  contextLength: entry.contextLength,
  estimatedDownloadSizeGiB: entry.estimatedDownloadSizeGiB,
  estimatedRuntimeMemoryGiB: entry.estimatedRuntimeMemoryGiB,
  verifiedAt: entry.verifiedAt,
  fallbackRepositories: entry.fallbackRepositories ?? [],
  notes: entry.notes ?? [],
}))

const managedLocalModelMap = new Map(managedLocalModelDefinitions.map((model) => [model.id, model]))

export const LLM_PROVIDER_ORDER = builtinProviders.map((provider) => provider.id)

export function isLlmProtocolId(value: unknown): value is LlmProtocolId {
  return value === "openai" || value === "anthropic"
}

export function isManagedLocalModelStatus(value: unknown): value is ManagedLocalModelStatus {
  return (
    value === "not-installed" ||
    value === "preparing" ||
    value === "downloading" ||
    value === "installing" ||
    value === "starting" ||
    value === "ready" ||
    value === "in-use" ||
    value === "attention"
  )
}

export function normalizeEndpoint(endpoint: string | null | undefined) {
  return (endpoint ?? "").trim().replace(/\/+$/, "")
}

export function getProtocolLabel(protocol: LlmProtocolId) {
  return PROTOCOL_LABELS[protocol]
}

export function getProtocolDefaultEndpoint(protocol: LlmProtocolId) {
  return PROTOCOL_DEFAULT_ENDPOINTS[protocol]
}

export function getProviderDefinition(providerId: string) {
  const builtinProvider = builtinProviderMap.get(providerId)

  if (builtinProvider) {
    return builtinProvider
  }

  const legacyProvider = LEGACY_PROVIDER_DEFAULTS[providerId]

  if (!legacyProvider) {
    return null
  }

  return {
    id: providerId,
    label: legacyProvider.label,
    presets: [],
  } satisfies LlmProviderDefinition
}

export function getProviderOptions(currentProviderId?: string) {
  const options = builtinProviders.map((provider) => ({
    value: provider.id,
    label: provider.label,
  }))

  if (!currentProviderId || options.some((option) => option.value === currentProviderId)) {
    return options
  }

  return [
    ...options,
    {
      value: currentProviderId,
      label: getProviderDefinition(currentProviderId)?.label ?? currentProviderId,
    },
  ]
}

export function getProviderPresets(providerId: string) {
  return getProviderDefinition(providerId)?.presets ?? []
}

export function getPresetDefinition(providerId: string, presetId: string | null | undefined) {
  if (!presetId) {
    return null
  }

  return getProviderPresets(providerId).find((preset) => preset.id === presetId) ?? null
}

export function getManagedLocalModelDefinitions() {
  return managedLocalModelDefinitions
}

export function getManagedLocalModelDefinition(modelId: string | null | undefined) {
  if (!modelId) {
    return null
  }

  return managedLocalModelMap.get(modelId) ?? null
}

export function isApiKeyRequired(configType: LlmConfigType) {
  return configType !== "managed-local"
}

export function resolveConfiguredModelName(
  model: Pick<LlmModelConfig, "configType" | "provider" | "presetId" | "customModelName" | "managedModelId" | "identifier">,
) {
  if (model.configType === "builtin") {
    return (
      getPresetDefinition(model.provider, model.presetId)?.label ??
      model.customModelName?.trim() ??
      model.presetId?.trim() ??
      ""
    )
  }

  if (model.configType === "managed-local") {
    return (
      getManagedLocalModelDefinition(model.managedModelId)?.displayName ??
      model.customModelName?.trim() ??
      model.identifier.trim()
    )
  }

  return model.customModelName?.trim() ?? ""
}

export function resolveRequestModelName(
  model: Pick<LlmModelConfig, "configType" | "provider" | "presetId" | "customModelName" | "managedModelId">,
) {
  if (model.configType === "builtin") {
    return (
      getPresetDefinition(model.provider, model.presetId)?.model ??
      model.customModelName?.trim() ??
      model.presetId?.trim() ??
      ""
    )
  }

  if (model.configType === "managed-local") {
    return (
      model.customModelName?.trim() ??
      getManagedLocalModelDefinition(model.managedModelId)?.filename.replace(/\.gguf$/i, "") ??
      model.managedModelId?.trim() ??
      ""
    )
  }

  return model.customModelName?.trim() ?? ""
}

export function resolveProviderLabel(
  model: Pick<LlmModelConfig, "configType" | "provider" | "providerLabel" | "protocol">,
) {
  const storedLabel = model.providerLabel.trim()

  if (model.configType === "managed-local" || model.provider === MANAGED_LOCAL_PROVIDER_ID) {
    return MANAGED_LOCAL_PROVIDER_LABEL
  }

  if (storedLabel) {
    return storedLabel
  }

  return getProviderDefinition(model.provider)?.label ?? getProtocolLabel(model.protocol)
}

export function resolveConfigProtocol(
  model: Pick<LlmModelConfig, "configType" | "provider" | "presetId" | "protocol">,
) {
  if (model.configType === "builtin") {
    return getPresetDefinition(model.provider, model.presetId)?.protocol ?? model.protocol
  }

  if (model.configType === "managed-local") {
    return "openai"
  }

  return model.protocol
}

export function resolveConfigEndpoint(
  model: Pick<LlmModelConfig, "configType" | "provider" | "presetId" | "protocol" | "endpoint">,
) {
  if (model.configType === "builtin") {
    return getPresetDefinition(model.provider, model.presetId)?.endpoint ?? normalizeEndpoint(model.endpoint)
  }

  if (model.configType === "managed-local") {
    return normalizeEndpoint(model.endpoint) || DEFAULT_MANAGED_LOCAL_ENDPOINT
  }

  return normalizeEndpoint(model.endpoint)
}

export function getLegacyProviderDefault(providerId: string) {
  return LEGACY_PROVIDER_DEFAULTS[providerId] ?? null
}

function normalizeProtocol(rawProtocol: string | null | undefined): LlmProtocolId {
  return rawProtocol === "anthropic-compatible" || rawProtocol === "anthropic" ? "anthropic" : "openai"
}

function getManagedLocalDownloadSourcePriority(source: ManagedLocalModelDownloadSource) {
  const haystack = [
    source.id,
    source.label,
    source.communityLabel ?? "",
    source.pageUrl,
    source.downloadUrl,
  ]
    .join(" ")
    .toLowerCase()

  if (
    haystack.includes("hf-mirror") ||
    haystack.includes("hf mirror") ||
    haystack.includes("modelscope") ||
    haystack.includes("openxlab") ||
    haystack.includes("mirror") ||
    haystack.includes("国内")
  ) {
    return 0
  }

  if (haystack.includes("huggingface")) {
    return 1
  }

  return 2
}

function normalizeManagedLocalDownloadSources(entry: ManagedLocalModelCatalogEntry): ManagedLocalModelDownloadSource[] {
  const sources = Array.isArray(entry.downloadSources) ? entry.downloadSources : []
  const normalized = sources
    .map<ManagedLocalModelDownloadSource | null>((source, index) => {
      const pageUrl = typeof source.pageUrl === "string" ? source.pageUrl.trim() : ""
      const downloadUrl = typeof source.downloadUrl === "string" ? source.downloadUrl.trim() : ""

      if (!pageUrl || !downloadUrl) {
        return null
      }

      return {
        id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : `source-${index + 1}`,
        label: typeof source.label === "string" && source.label.trim() ? source.label.trim() : `Source ${index + 1}`,
        communityLabel:
          typeof source.communityLabel === "string" && source.communityLabel.trim() ? source.communityLabel.trim() : null,
        pageUrl,
        downloadUrl,
      }
    })
    .filter((source): source is ManagedLocalModelDownloadSource => Boolean(source))
    .sort((left, right) => {
      const priorityDiff = getManagedLocalDownloadSourcePriority(left) - getManagedLocalDownloadSourcePriority(right)

      if (priorityDiff !== 0) {
        return priorityDiff
      }

      return left.label.localeCompare(right.label, "en")
    })

  if (normalized.length > 0) {
    return normalized
  }

  return [
    {
      id: "primary",
      label: "Primary",
      communityLabel: null,
      pageUrl: entry.repositoryPage,
      downloadUrl: entry.downloadUrl,
    },
  ]
}
