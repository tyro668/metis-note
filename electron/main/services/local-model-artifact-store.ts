import path from "node:path"
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import type { ManagedLocalModelDefinition, ManagedLocalModelStatus } from "../../../src/shared/llm"

export interface LocalModelArtifactRecord {
  id: string
  modelId: string
  status: ManagedLocalModelStatus
  fileName: string
  downloadUrl: string
  repositoryPage: string
  filePath: string | null
  tempPath: string | null
  downloadedBytes: number
  totalBytes: number | null
  progress: number | null
  errorMessage: string | null
  autoEnableOnReady: boolean
  createdAt: string
  updatedAt: string
}

export interface LocalModelRuntimeState {
  state: "idle" | "starting" | "running" | "error"
  activeModelId: string | null
  endpoint: string | null
  port: number | null
  message: string | null
  updatedAt: string
}

interface LocalModelRegistryPayload {
  version: 1
  artifacts: LocalModelArtifactRecord[]
  runtime: LocalModelRuntimeState
}

const DEFAULT_RUNTIME_STATE: LocalModelRuntimeState = {
  state: "idle",
  activeModelId: null,
  endpoint: null,
  port: null,
  message: null,
  updatedAt: new Date(0).toISOString(),
}

export class LocalModelArtifactStore {
  private readonly registryPath: string
  private readonly registryTempPath: string
  readonly catalogDir: string
  readonly downloadsDir: string
  readonly modelsDir: string
  readonly runtimeDir: string
  readonly logsDir: string
  private initialized = false
  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(private readonly rootDir: string) {
    this.registryPath = path.join(rootDir, "registry.json")
    this.registryTempPath = path.join(rootDir, "registry.json.tmp")
    this.catalogDir = path.join(rootDir, "catalog")
    this.downloadsDir = path.join(rootDir, "downloads")
    this.modelsDir = path.join(rootDir, "models")
    this.runtimeDir = path.join(rootDir, "runtime")
    this.logsDir = path.join(rootDir, "logs")
  }

  async ensureReady() {
    if (this.initialized) {
      return
    }

    await mkdir(this.catalogDir, { recursive: true })
    await mkdir(this.downloadsDir, { recursive: true })
    await mkdir(this.modelsDir, { recursive: true })
    await mkdir(this.runtimeDir, { recursive: true })
    await mkdir(this.logsDir, { recursive: true })

    try {
      await stat(this.registryPath)
    } catch {
      await this.writeRegistry(this.createDefaultRegistry())
    }

    this.initialized = true
  }

  async listArtifacts() {
    await this.ensureReady()
    const registry = await this.readRegistry()

    return registry.artifacts
  }

  async getArtifactById(id: string) {
    await this.ensureReady()
    const registry = await this.readRegistry()

    return registry.artifacts.find((artifact) => artifact.id === id) ?? null
  }

  async getArtifactByModelId(modelId: string) {
    await this.ensureReady()
    const registry = await this.readRegistry()

    return registry.artifacts.find((artifact) => artifact.modelId === modelId) ?? null
  }

  async prepareArtifact(definition: ManagedLocalModelDefinition, options?: { autoEnableOnReady?: boolean }) {
    await this.ensureReady()
    return this.withMutationLock(async () => {
      const registry = await this.readRegistry()
      const existing = registry.artifacts.find((artifact) => artifact.modelId === definition.id)

      if (existing) {
        const updated = {
          ...existing,
          autoEnableOnReady: existing.autoEnableOnReady || Boolean(options?.autoEnableOnReady),
          updatedAt: new Date().toISOString(),
        }

        await this.writeRegistry({
          ...registry,
          artifacts: registry.artifacts.map((artifact) => (artifact.id === existing.id ? updated : artifact)),
        })

        return updated
      }

      const now = new Date().toISOString()
      const created: LocalModelArtifactRecord = {
        id: `artifact-${definition.id}`,
        modelId: definition.id,
        status: "preparing",
        fileName: definition.filename,
        downloadUrl: definition.downloadUrl,
        repositoryPage: definition.repositoryPage,
        filePath: this.getInstalledModelPath(definition),
        tempPath: this.getPartialDownloadPath(definition),
        downloadedBytes: 0,
        totalBytes: null,
        progress: 0,
        errorMessage: null,
        autoEnableOnReady: Boolean(options?.autoEnableOnReady),
        createdAt: now,
        updatedAt: now,
      }

      await this.writeRegistry({
        ...registry,
        artifacts: [created, ...registry.artifacts],
      })

      return created
    })
  }

  async updateArtifact(id: string, patch: Partial<Omit<LocalModelArtifactRecord, "id" | "modelId" | "createdAt">>) {
    await this.ensureReady()
    return this.withMutationLock(async () => {
      const registry = await this.readRegistry()
      const current = registry.artifacts.find((artifact) => artifact.id === id)

      if (!current) {
        return null
      }

      const updated: LocalModelArtifactRecord = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      }

      await this.writeRegistry({
        ...registry,
        artifacts: registry.artifacts.map((artifact) => (artifact.id === id ? updated : artifact)),
      })

      return updated
    })
  }

  async removeArtifact(id: string) {
    await this.ensureReady()
    return this.withMutationLock(async () => {
      const registry = await this.readRegistry()
      const current = registry.artifacts.find((artifact) => artifact.id === id)

      if (!current) {
        return null
      }

      await Promise.all([
        current.tempPath ? rm(current.tempPath, { force: true }).catch(() => undefined) : Promise.resolve(),
        current.filePath ? rm(current.filePath, { force: true }).catch(() => undefined) : Promise.resolve(),
      ])

      await this.writeRegistry({
        ...registry,
        artifacts: registry.artifacts.filter((artifact) => artifact.id !== id),
      })

      return current
    })
  }

  async getRuntimeState() {
    await this.ensureReady()
    const registry = await this.readRegistry()

    return registry.runtime
  }

  async setRuntimeState(nextState: Partial<LocalModelRuntimeState>) {
    await this.ensureReady()
    return this.withMutationLock(async () => {
      const registry = await this.readRegistry()
      const runtime: LocalModelRuntimeState = {
        ...registry.runtime,
        ...nextState,
        updatedAt: new Date().toISOString(),
      }

      await this.writeRegistry({
        ...registry,
        runtime,
      })

      return runtime
    })
  }

  getInstalledModelPath(definition: ManagedLocalModelDefinition) {
    return path.join(this.modelsDir, definition.id, definition.filename)
  }

  getPartialDownloadPath(definition: ManagedLocalModelDefinition) {
    return path.join(this.downloadsDir, definition.id, `${definition.filename}.part`)
  }

  getLogPath(modelId: string) {
    return path.join(this.logsDir, `${modelId}.log`)
  }

  private async readRegistry(): Promise<LocalModelRegistryPayload> {
    const raw = await readFile(this.registryPath, "utf-8")
    const trimmed = raw.trim()

    if (!trimmed) {
      return this.recoverCorruptedRegistry("registry file is empty")
    }

    let parsed: Partial<LocalModelRegistryPayload>

    try {
      parsed = JSON.parse(trimmed) as Partial<LocalModelRegistryPayload>
    } catch (error) {
      return this.recoverCorruptedRegistry(
        error instanceof Error ? `registry JSON is invalid: ${error.message}` : "registry JSON is invalid",
      )
    }

    return {
      version: 1,
      artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts.map((artifact) => this.normalizeArtifact(artifact)) : [],
      runtime: this.normalizeRuntimeState(parsed.runtime),
    }
  }

  private async writeRegistry(payload: LocalModelRegistryPayload) {
    const serialized = JSON.stringify(payload, null, 2)
    await writeFile(this.registryTempPath, serialized, "utf-8")
    await rename(this.registryTempPath, this.registryPath)
  }

  private createDefaultRegistry(): LocalModelRegistryPayload {
    return {
      version: 1,
      artifacts: [],
      runtime: {
        ...DEFAULT_RUNTIME_STATE,
        updatedAt: new Date().toISOString(),
      },
    }
  }

  private async recoverCorruptedRegistry(reason: string): Promise<LocalModelRegistryPayload> {
    const corruptedPath = path.join(
      this.rootDir,
      `registry.corrupted-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    )

    try {
      await rename(this.registryPath, corruptedPath)
      console.error(
        `[metis-note] Local model registry was corrupted (${reason}). Saved a copy to ${corruptedPath} and reset the registry.`,
      )
    } catch (error) {
      console.error(
        `[metis-note] Local model registry was corrupted (${reason}) and could not be preserved before reset.`,
        error,
      )
    }

    const fallback = this.createDefaultRegistry()
    await this.writeRegistry(fallback)

    return fallback
  }

  private async withMutationLock<T>(operation: () => Promise<T>) {
    const task = this.mutationQueue.then(operation, operation)
    this.mutationQueue = task.then(
      () => undefined,
      () => undefined,
    )

    return task
  }

  private normalizeArtifact(artifact: Partial<LocalModelArtifactRecord>): LocalModelArtifactRecord {
    const now = new Date().toISOString()

    return {
      id: typeof artifact.id === "string" && artifact.id.trim() ? artifact.id.trim() : `artifact-${Date.now()}`,
      modelId: typeof artifact.modelId === "string" ? artifact.modelId.trim() : "",
      status: this.normalizeArtifactStatus(artifact.status),
      fileName: typeof artifact.fileName === "string" ? artifact.fileName : "",
      downloadUrl: typeof artifact.downloadUrl === "string" ? artifact.downloadUrl : "",
      repositoryPage: typeof artifact.repositoryPage === "string" ? artifact.repositoryPage : "",
      filePath: typeof artifact.filePath === "string" && artifact.filePath.trim() ? artifact.filePath : null,
      tempPath: typeof artifact.tempPath === "string" && artifact.tempPath.trim() ? artifact.tempPath : null,
      downloadedBytes: typeof artifact.downloadedBytes === "number" && artifact.downloadedBytes >= 0 ? artifact.downloadedBytes : 0,
      totalBytes: typeof artifact.totalBytes === "number" && artifact.totalBytes > 0 ? artifact.totalBytes : null,
      progress: typeof artifact.progress === "number" && artifact.progress >= 0 ? artifact.progress : null,
      errorMessage: typeof artifact.errorMessage === "string" && artifact.errorMessage.trim() ? artifact.errorMessage : null,
      autoEnableOnReady: Boolean(artifact.autoEnableOnReady),
      createdAt: typeof artifact.createdAt === "string" && artifact.createdAt ? artifact.createdAt : now,
      updatedAt: typeof artifact.updatedAt === "string" && artifact.updatedAt ? artifact.updatedAt : now,
    }
  }

  private normalizeRuntimeState(runtime: Partial<LocalModelRuntimeState> | undefined): LocalModelRuntimeState {
    const state = runtime?.state

    return {
      state: state === "starting" || state === "running" || state === "error" ? state : "idle",
      activeModelId: typeof runtime?.activeModelId === "string" && runtime.activeModelId.trim() ? runtime.activeModelId : null,
      endpoint: typeof runtime?.endpoint === "string" && runtime.endpoint.trim() ? runtime.endpoint : null,
      port: typeof runtime?.port === "number" && runtime.port > 0 ? runtime.port : null,
      message: typeof runtime?.message === "string" && runtime.message.trim() ? runtime.message : null,
      updatedAt: typeof runtime?.updatedAt === "string" && runtime.updatedAt ? runtime.updatedAt : new Date().toISOString(),
    }
  }

  private normalizeArtifactStatus(status: LocalModelArtifactRecord["status"] | undefined): ManagedLocalModelStatus {
    if (
      status === "preparing" ||
      status === "downloading" ||
      status === "installing" ||
      status === "starting" ||
      status === "ready" ||
      status === "in-use" ||
      status === "attention"
    ) {
      return status
    }

    return "preparing"
  }
}
