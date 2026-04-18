import path from "node:path"
import { constants, createWriteStream, type WriteStream } from "node:fs"
import { access, mkdir, rename, rm, stat, statfs } from "node:fs/promises"
import {
  getLlama,
  LlamaChatSession,
  LlamaLogLevel,
  NoBinaryFoundError,
  resolveChatWrapper,
  type Llama,
  type LlamaContext,
  type LlamaModel,
} from "node-llama-cpp"
import {
  DEFAULT_MANAGED_LOCAL_ENDPOINT,
  getManagedLocalModelDefinition,
  type LlmModelConfig,
  type ManagedLocalModelDefinition,
} from "../../../src/shared/llm"
import { LocalModelArtifactStore } from "./local-model-artifact-store"
import { LlmModelStore } from "./llm-model-store"

interface ActiveRuntimeSession {
  modelId: string
  endpoint: string
  model: LlamaModel
  context: LlamaContext
  session: LlamaChatSession
  logStream: WriteStream
}

const MANAGED_LOCAL_WRITE_MAX_TOKENS = 800

export class LocalModelManager {
  private readonly artifactStore: LocalModelArtifactStore
  private initialized = false
  private readonly installControllers = new Map<string, AbortController>()
  private activeRuntime: ActiveRuntimeSession | null = null
  private llamaPromise: Promise<Llama> | null = null
  private runtimeLogStream: WriteStream | null = null
  private activeGenerationSignal: AbortSignal | null = null

  constructor(baseDir: string, private readonly llmModelStore: LlmModelStore) {
    this.artifactStore = new LocalModelArtifactStore(baseDir)
  }

  async ensureReady() {
    if (this.initialized) {
      return
    }

    await this.artifactStore.ensureReady()
    await this.artifactStore.setRuntimeState({
      state: "idle",
      activeModelId: null,
      endpoint: null,
      port: null,
      message: null,
    })

    this.initialized = true

    const models = await this.llmModelStore.list()
    const persistedActive = models.find(
      (model) =>
        model.configType === "managed-local" &&
        model.enabled &&
        model.managedModelId &&
        (model.managedStatus === "in-use" || model.managedStatus === "starting" || model.managedStatus === "ready"),
    )

    if (persistedActive?.managedModelId) {
      void this.activateManagedLocalByModelId(persistedActive.managedModelId).catch((error) => {
        console.error(
          `[metis-note] Failed to restore managed local runtime for ${persistedActive.managedModelId}.`,
          error,
        )
      })
    }
  }

  async addManagedLocal(modelId: string) {
    await this.ensureReady()
    const definition = this.requireDefinition(modelId)
    const models = await this.llmModelStore.list()
    const autoEnableOnReady = !models.some((model) => model.enabled)
    const artifact = await this.artifactStore.prepareArtifact(definition, { autoEnableOnReady })

    const synced = await this.llmModelStore.syncManagedLocal(modelId, {
      installedArtifactId: artifact.id,
      managedStatus: artifact.status,
      managedProgress: artifact.progress ?? 0,
      managedDownloadedBytes: artifact.downloadedBytes,
      managedTotalBytes: artifact.totalBytes ?? this.bytesFromGiB(definition.estimatedDownloadSizeGiB),
      managedStatusMessage: artifact.errorMessage,
      enabled: false,
    })

    if (!this.installControllers.has(modelId) && !this.isArtifactReady(artifact.status)) {
      void this.installManagedLocalInBackground(definition, artifact.id)
    }

    return synced
  }

  async activateManagedLocalByConfigId(id: string) {
    await this.ensureReady()
    const config = await this.llmModelStore.get(id)

    if (!config) {
      throw new Error(`Model not found: ${id}`)
    }

    if (config.configType !== "managed-local" || !config.managedModelId) {
      return this.llmModelStore.enable(id)
    }

    return this.activateManagedLocalByModelId(config.managedModelId)
  }

  async activateManagedLocalByModelId(modelId: string) {
    await this.ensureReady()
    const definition = this.requireDefinition(modelId)
    const config = await this.llmModelStore.getManagedLocal(modelId)
    const artifact = config?.installedArtifactId
      ? await this.artifactStore.getArtifactById(config.installedArtifactId)
      : await this.artifactStore.getArtifactByModelId(modelId)

    if (!config || !artifact) {
      throw new Error(`Managed local model is not installed: ${modelId}`)
    }

    if (!artifact.filePath || !(await this.fileExists(artifact.filePath))) {
      throw new Error(`Managed local model file is not ready yet: ${definition.displayName}`)
    }

    if (this.activeRuntime?.modelId === modelId) {
      await this.llmModelStore.syncManagedLocal(modelId, {
        enabled: true,
        managedStatus: "in-use",
        endpoint: this.activeRuntime.endpoint,
        managedProgress: 1,
        managedStatusMessage: null,
      })

      await this.artifactStore.updateArtifact(artifact.id, {
        status: "in-use",
        progress: 1,
        errorMessage: null,
      })

      return (await this.llmModelStore.getManagedLocal(modelId)) ?? config
    }

    if (this.activeRuntime) {
      await this.stopActiveRuntime()
    }

    const endpoint = DEFAULT_MANAGED_LOCAL_ENDPOINT
    const logPath = this.artifactStore.getLogPath(modelId)
    await mkdir(path.dirname(logPath), { recursive: true })
    const logStream = createWriteStream(logPath, { flags: "a" })
    this.runtimeLogStream = logStream

    await this.llmModelStore.syncManagedLocal(modelId, {
      enabled: true,
      endpoint,
      managedStatus: "starting",
      managedProgress: 1,
      managedStatusMessage: null,
    })
    await this.artifactStore.updateArtifact(artifact.id, {
      status: "starting",
      progress: 1,
      errorMessage: null,
    })
    await this.artifactStore.setRuntimeState({
      state: "starting",
      activeModelId: modelId,
      endpoint,
      port: null,
      message: null,
    })

    let model: LlamaModel | null = null
    let context: LlamaContext | null = null
    let session: LlamaChatSession | null = null

    try {
      this.writeRuntimeLog(`Starting node-llama-cpp runtime for ${definition.displayName}.`)
      const llama = await this.getLlamaInstance()
      let lastLoggedProgress = -25
      model = await llama.loadModel({
        modelPath: artifact.filePath,
        onLoadProgress: (progress) => {
          const percent = Math.round(progress * 100)

          if (percent === 100 || percent - lastLoggedProgress >= 25) {
            lastLoggedProgress = percent
            this.writeRuntimeLog(`Loading model weights: ${percent}%`)
          }
        },
      })

      const contextSize = Math.min(definition.contextLength, 16_384)
      context = await model.createContext({
        contextSize: { max: contextSize },
        flashAttention: true,
        failedCreationRemedy: {
          retries: 4,
        },
      })

      const chatWrapper = this.resolveManagedLocalChatWrapper(model, definition)
      session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        chatWrapper,
        autoDisposeSequence: true,
      })

      this.activeRuntime = {
        modelId,
        endpoint,
        model,
        context,
        session,
        logStream,
      }

      this.writeRuntimeLog(
        `Runtime ready with ${chatWrapper.wrapperName} wrapper at context size ${context.contextSize}.`,
      )
      await this.artifactStore.setRuntimeState({
        state: "running",
        activeModelId: modelId,
        endpoint,
        port: null,
        message: null,
      })
      await this.artifactStore.updateArtifact(artifact.id, {
        status: "in-use",
        progress: 1,
        errorMessage: null,
      })

      return this.llmModelStore.syncManagedLocal(modelId, {
        enabled: true,
        endpoint,
        managedStatus: "in-use",
        managedProgress: 1,
        managedStatusMessage: null,
      })
    } catch (error) {
      this.activeRuntime = null
      const message = this.normalizeRuntimeError(error)
      this.writeRuntimeLog(`Runtime start failed: ${message}`)
      await this.disposeRuntimeResources({ session, context, model })

      if (this.runtimeLogStream === logStream) {
        this.runtimeLogStream = null
      }

      await this.finishLogStream(logStream).catch(() => undefined)

      await this.artifactStore.setRuntimeState({
        state: "error",
        activeModelId: modelId,
        endpoint,
        port: null,
        message,
      })
      await this.artifactStore.updateArtifact(artifact.id, {
        status: "attention",
        errorMessage: message,
      })

      return this.llmModelStore.syncManagedLocal(modelId, {
        enabled: false,
        endpoint,
        managedStatus: "attention",
        managedProgress: 1,
        managedStatusMessage: message,
      })
    }
  }

  async deleteManagedLocalByConfigId(id: string) {
    await this.ensureReady()
    const config = await this.llmModelStore.get(id)

    if (!config) {
      throw new Error(`Model not found: ${id}`)
    }

    if (config.configType !== "managed-local" || !config.managedModelId) {
      return this.llmModelStore.delete(id)
    }

    const controller = this.installControllers.get(config.managedModelId)

    if (controller) {
      controller.abort()
      this.installControllers.delete(config.managedModelId)
    }

    if (this.activeRuntime?.modelId === config.managedModelId) {
      await this.stopActiveRuntime({ markCurrentReady: false })
    }

    const artifact = config.installedArtifactId
      ? await this.artifactStore.getArtifactById(config.installedArtifactId)
      : await this.artifactStore.getArtifactByModelId(config.managedModelId)

    if (artifact) {
      await this.artifactStore.removeArtifact(artifact.id)
    }

    return this.llmModelStore.delete(id)
  }

  async stopIfManagedLocalEnabled(id: string) {
    await this.ensureReady()
    const config = await this.llmModelStore.get(id)

    if (config?.configType === "managed-local") {
      return
    }

    if (this.activeRuntime) {
      await this.stopActiveRuntime()
    }
  }

  async shutdown() {
    for (const controller of this.installControllers.values()) {
      controller.abort()
    }

    this.installControllers.clear()
    await this.stopActiveRuntime({ markCurrentReady: false })
    await this.disposeLlamaInstance()
  }

  async streamManagedLocalResponse(options: {
    modelId: string
    systemPrompt: string
    userPrompt: string
    signal: AbortSignal
    onTextChunk: (text: string) => void
  }) {
    await this.ensureReady()

    if (!this.activeRuntime || this.activeRuntime.modelId !== options.modelId) {
      await this.activateManagedLocalByModelId(options.modelId)
    }

    const runtime = this.activeRuntime

    if (!runtime || runtime.modelId !== options.modelId) {
      throw new Error(`Managed local runtime is not active: ${options.modelId}`)
    }

    if (this.activeGenerationSignal && this.activeGenerationSignal !== options.signal) {
      throw new Error("The current local model is busy generating another response.")
    }

    this.activeGenerationSignal = options.signal
    runtime.session.setChatHistory(
      runtime.session.chatWrapper.generateInitialChatHistory({
        systemPrompt: options.systemPrompt.trim() || undefined,
      }),
    )

    this.writeRuntimeLog(`Starting managed local generation for ${options.modelId}.`)

    try {
      const response = await runtime.session.prompt(options.userPrompt, {
        signal: options.signal,
        maxTokens: MANAGED_LOCAL_WRITE_MAX_TOKENS,
        temperature: 0.6,
        topP: 0.92,
        trimWhitespaceSuffix: true,
        onTextChunk: (chunk) => {
          if (!chunk) {
            return
          }

          options.onTextChunk(chunk)
        },
      })

      this.writeRuntimeLog(`Finished managed local generation for ${options.modelId}.`)
      return response
    } catch (error) {
      this.writeRuntimeLog(
        `Managed local generation failed for ${options.modelId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      )
      throw error
    } finally {
      if (this.activeGenerationSignal === options.signal) {
        this.activeGenerationSignal = null
      }

      try {
        runtime.session.resetChatHistory()
      } catch (error) {
        this.writeRuntimeLog(
          `Failed to reset chat history after generation: ${error instanceof Error ? error.message : "unknown error"}`,
        )
      }
    }
  }

  private async installManagedLocalInBackground(definition: ManagedLocalModelDefinition, artifactId: string) {
    const controller = new AbortController()
    this.installControllers.set(definition.id, controller)

    try {
      await this.runManagedLocalInstall(definition, artifactId, controller.signal)
    } finally {
      this.installControllers.delete(definition.id)
    }
  }

  private async runManagedLocalInstall(definition: ManagedLocalModelDefinition, artifactId: string, signal: AbortSignal) {
    const artifact = await this.artifactStore.getArtifactById(artifactId)
    const estimatedBytes = this.bytesFromGiB(definition.estimatedDownloadSizeGiB)

    try {
      await this.ensureDiskSpace(estimatedBytes)
      await this.artifactStore.updateArtifact(artifactId, {
        status: "downloading",
        totalBytes: artifact?.totalBytes ?? estimatedBytes,
        progress: 0,
        errorMessage: null,
      })
      await this.llmModelStore.syncManagedLocal(definition.id, {
        installedArtifactId: artifactId,
        managedStatus: "downloading",
        managedProgress: 0,
        managedDownloadedBytes: artifact?.downloadedBytes ?? 0,
        managedTotalBytes: artifact?.totalBytes ?? estimatedBytes,
        managedStatusMessage: null,
        enabled: false,
      })

      const tempPath = this.artifactStore.getPartialDownloadPath(definition)
      const finalPath = this.artifactStore.getInstalledModelPath(definition)
      await mkdir(path.dirname(tempPath), { recursive: true })
      await mkdir(path.dirname(finalPath), { recursive: true })

      let resumeBytes = 0

      try {
        resumeBytes = (await stat(tempPath)).size
      } catch {
        resumeBytes = 0
      }

      const headers = new Headers()

      if (resumeBytes > 0) {
        headers.set("Range", `bytes=${resumeBytes}-`)
      }

      const response = await fetch(definition.downloadUrl, {
        headers,
        signal,
      })

      if (!(response.ok || response.status === 206)) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`)
      }

      const contentRange = response.headers.get("content-range")
      const contentLengthHeader = response.headers.get("content-length")
      const responseLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : NaN
      const shouldAppend = response.status === 206 && resumeBytes > 0
      const initialBytes = shouldAppend ? resumeBytes : 0
      const totalBytes =
        contentRange && contentRange.includes("/")
          ? Number.parseInt(contentRange.split("/")[1] ?? "", 10)
          : Number.isFinite(responseLength)
            ? initialBytes + responseLength
            : estimatedBytes

      const output = createWriteStream(tempPath, { flags: shouldAppend ? "a" : "w" })

      if (!response.body) {
        throw new Error("Download response body is empty.")
      }

      let downloadedBytes = initialBytes
      let lastPersist = 0

      const reader = response.body.getReader()

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            break
          }

          if (!value) {
            continue
          }

          output.write(value)
          downloadedBytes += value.byteLength

          const now = Date.now()

          if (downloadedBytes === totalBytes || now - lastPersist >= 500) {
            const progress = totalBytes > 0 ? Math.min(1, downloadedBytes / totalBytes) : null
            await this.artifactStore.updateArtifact(artifactId, {
              status: "downloading",
              downloadedBytes,
              totalBytes,
              progress,
              errorMessage: null,
            })
            await this.llmModelStore.syncManagedLocal(definition.id, {
              installedArtifactId: artifactId,
              managedStatus: "downloading",
              managedProgress: progress,
              managedDownloadedBytes: downloadedBytes,
              managedTotalBytes: totalBytes,
              managedStatusMessage: null,
              enabled: false,
            })
            lastPersist = now
          }
        }
      } finally {
        reader.releaseLock()
        await new Promise<void>((resolve, reject) => {
          output.end((error?: Error | null) => {
            if (error) {
              reject(error)
              return
            }

            resolve()
          })
        })
      }

      await this.artifactStore.updateArtifact(artifactId, {
        status: "installing",
        downloadedBytes: totalBytes,
        totalBytes,
        progress: 1,
        errorMessage: null,
      })
      await this.llmModelStore.syncManagedLocal(definition.id, {
        installedArtifactId: artifactId,
        managedStatus: "installing",
        managedProgress: 1,
        managedDownloadedBytes: totalBytes,
        managedTotalBytes: totalBytes,
        managedStatusMessage: null,
        enabled: false,
      })

      await rename(tempPath, finalPath)

      const installedArtifact = await this.artifactStore.updateArtifact(artifactId, {
        status: "ready",
        filePath: finalPath,
        tempPath,
        downloadedBytes: totalBytes,
        totalBytes,
        progress: 1,
        errorMessage: null,
      })

      await this.llmModelStore.syncManagedLocal(definition.id, {
        installedArtifactId: artifactId,
        managedStatus: "ready",
        managedProgress: 1,
        managedDownloadedBytes: totalBytes,
        managedTotalBytes: totalBytes,
        managedStatusMessage: null,
        enabled: false,
      })

      if (installedArtifact?.autoEnableOnReady) {
        await this.activateManagedLocalByModelId(definition.id)
      }
    } catch (error) {
      if (signal.aborted) {
        return
      }

      const message = error instanceof Error ? error.message : "Failed to install the managed local model."
      await this.artifactStore.updateArtifact(artifactId, {
        status: "attention",
        errorMessage: message,
      })
      await this.llmModelStore.syncManagedLocal(definition.id, {
        installedArtifactId: artifactId,
        managedStatus: "attention",
        managedStatusMessage: message,
        enabled: false,
      })
    }
  }

  private async stopActiveRuntime(options: { markCurrentReady?: boolean } = {}) {
    if (!this.activeRuntime) {
      await this.artifactStore.setRuntimeState({
        state: "idle",
        activeModelId: null,
        endpoint: null,
        port: null,
        message: null,
      })
      return
    }

    const current = this.activeRuntime
    this.activeRuntime = null
    this.writeRuntimeLog(`Stopping node-llama-cpp runtime for ${current.modelId}.`)
    await this.disposeRuntimeResources(current)

    if (this.runtimeLogStream === current.logStream) {
      this.runtimeLogStream = null
    }

    await this.finishLogStream(current.logStream).catch(() => undefined)
    await this.artifactStore.setRuntimeState({
      state: "idle",
      activeModelId: null,
      endpoint: null,
      port: null,
      message: null,
    })

    if (options.markCurrentReady !== false) {
      const artifact = await this.artifactStore.getArtifactByModelId(current.modelId)

      if (artifact) {
        await this.artifactStore.updateArtifact(artifact.id, {
          status: "ready",
          errorMessage: null,
        })
      }

      await this.llmModelStore.syncManagedLocal(current.modelId, {
        enabled: false,
        managedStatus: "ready",
        managedProgress: 1,
        managedStatusMessage: null,
      })
    }
  }

  private async getLlamaInstance() {
    if (!this.llamaPromise) {
      this.llamaPromise = getLlama({
        build: "never",
        gpu: "auto",
        logLevel: LlamaLogLevel.warn,
        progressLogs: false,
        logger: (level: LlamaLogLevel, message: string) => {
          this.writeRuntimeLog(`[${level}] ${message}`)
        },
      }).catch((error) => {
        this.llamaPromise = null
        throw error
      })
    }

    return this.llamaPromise
  }

  private async disposeRuntimeResources(resources: {
    session?: LlamaChatSession | null
    context?: LlamaContext | null
    model?: LlamaModel | null
  }) {
    if (resources.session && !resources.session.disposed) {
      try {
        resources.session.dispose({ disposeSequence: true })
      } catch (error) {
        this.writeRuntimeLog(
          `Failed to dispose chat session: ${error instanceof Error ? error.message : "unknown error"}`,
        )
      }
    }

    if (resources.context && !resources.context.disposed) {
      try {
        await resources.context.dispose()
      } catch (error) {
        this.writeRuntimeLog(`Failed to dispose context: ${error instanceof Error ? error.message : "unknown error"}`)
      }
    }

    if (resources.model && !resources.model.disposed) {
      try {
        await resources.model.dispose()
      } catch (error) {
        this.writeRuntimeLog(`Failed to dispose model: ${error instanceof Error ? error.message : "unknown error"}`)
      }
    }
  }

  private async finishLogStream(logStream: WriteStream | null) {
    if (!logStream || logStream.destroyed) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      logStream.end((error?: Error | null) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }

  private async disposeLlamaInstance() {
    const current = this.llamaPromise
    this.llamaPromise = null

    if (!current) {
      return
    }

    try {
      const llama = await current

      if (!llama.disposed) {
        await llama.dispose()
      }
    } catch {
      // Ignore teardown failures during shutdown.
    }
  }

  private writeRuntimeLog(message: string) {
    if (!this.runtimeLogStream) {
      return
    }

    this.runtimeLogStream.write(`[${new Date().toISOString()}] ${message}\n`)
  }

  private normalizeRuntimeError(error: unknown) {
    if (error instanceof NoBinaryFoundError) {
      return "node-llama-cpp runtime is not available on this device yet."
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message
    }

    return "Failed to start the managed local runtime."
  }

  private async ensureDiskSpace(requiredBytes: number) {
    const safetyBuffer = 512 * 1024 * 1024

    try {
      const info = await statfs(this.artifactStore.modelsDir)
      const freeBytes = Number(info.bavail) * Number(info.bsize)

      if (Number.isFinite(freeBytes) && freeBytes > 0 && freeBytes < requiredBytes + safetyBuffer) {
        throw new Error("Not enough free disk space for the selected local model.")
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Not enough free disk space")) {
        throw error
      }
    }
  }

  private async fileExists(filePath: string) {
    try {
      await access(filePath, constants.F_OK)
      return true
    } catch {
      return false
    }
  }

  private bytesFromGiB(value: number) {
    return Math.max(1, Math.round(value * 1024 * 1024 * 1024))
  }

  private isArtifactReady(status: string) {
    return status === "ready" || status === "in-use"
  }

  private resolveManagedLocalChatWrapper(model: LlamaModel, definition: ManagedLocalModelDefinition) {
    if (this.isQwenManagedLocalModel(definition)) {
      return resolveChatWrapper(model, {
        type: "qwen",
        customWrapperSettings: {
          qwen: {
            variation:
              definition.displayName.includes("3.5") || definition.family.includes("3.5") ? "3.5" : "3",
          },
        },
      })
    }

    return resolveChatWrapper(model)
  }

  private isQwenManagedLocalModel(definition: ManagedLocalModelDefinition) {
    return /qwen/i.test(definition.family) || /qwen/i.test(definition.displayName)
  }

  private requireDefinition(modelId: string) {
    const definition = getManagedLocalModelDefinition(modelId)

    if (!definition) {
      throw new Error(`Managed local model not found: ${modelId}`)
    }

    return definition
  }
}
