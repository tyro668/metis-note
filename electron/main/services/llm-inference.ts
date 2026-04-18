import { randomUUID } from "node:crypto"
import type { WebContents } from "electron"
import { getMessages, type AppLocale } from "../../../src/shared/i18n"
import {
  resolveConfigEndpoint,
  resolveConfigProtocol,
  resolveRequestModelName,
  type LlmModelConfig,
  type LlmStreamChatParams,
  type LlmStreamChunkPayload,
  type LlmStreamEndPayload,
  type LlmStreamErrorPayload,
  type LlmStreamStartResult,
} from "../../../src/shared/llm"
import { LocalModelManager } from "./local-model-manager"
import { LlmModelStore } from "./llm-model-store"

interface ActiveInferenceStream {
  id: string
  sender: WebContents
  model: LlmModelConfig
  controller: AbortController
  timeout: NodeJS.Timeout
  cancelledByUser: boolean
}

interface SseEventPayload {
  event: string
  data: string
}

const REMOTE_STREAM_TIMEOUT_MS = 60_000
const LOCAL_STREAM_TIMEOUT_MS = 120_000
const REMOTE_STREAM_MAX_TOKENS = 800

export class LlmInferenceService {
  private readonly streams = new Map<string, ActiveInferenceStream>()
  private readonly modelMessages
  private readonly aiWriteMessages

  constructor(
    private readonly llmModelStore: LlmModelStore,
    private readonly localModelManager: LocalModelManager,
    locale: AppLocale,
  ) {
    const messages = getMessages(locale)
    this.modelMessages = messages.settings.intelligence
    this.aiWriteMessages = messages.editor.aiWrite
  }

  async startStreamChat(sender: WebContents, params: LlmStreamChatParams): Promise<LlmStreamStartResult> {
    const model = (await this.llmModelStore.list()).find((item) => item.enabled) ?? null

    if (!model) {
      throw new Error(this.aiWriteMessages.noEnabledModelError)
    }

    const streamId = randomUUID()
    const controller = new AbortController()
    const timeoutMessage =
      model.configType === "managed-local" ? this.aiWriteMessages.localTimeoutError : this.aiWriteMessages.remoteTimeoutError
    const timeoutMs = model.configType === "managed-local" ? LOCAL_STREAM_TIMEOUT_MS : REMOTE_STREAM_TIMEOUT_MS
    const timeout = setTimeout(() => {
      controller.abort(new Error(timeoutMessage))
    }, timeoutMs)
    const stream: ActiveInferenceStream = {
      id: streamId,
      sender,
      model,
      controller,
      timeout,
      cancelledByUser: false,
    }

    this.streams.set(streamId, stream)
    setTimeout(() => {
      void this.runStream(stream, params)
    }, 0)

    return {
      streamId,
    }
  }

  async cancelStream(streamId: string) {
    const stream = this.streams.get(streamId)

    if (!stream) {
      return
    }

    stream.cancelledByUser = true
    stream.controller.abort(new Error("cancelled"))
  }

  shutdown() {
    for (const stream of this.streams.values()) {
      stream.cancelledByUser = true
      clearTimeout(stream.timeout)
      stream.controller.abort(new Error("shutdown"))
    }

    this.streams.clear()
  }

  private async runStream(stream: ActiveInferenceStream, params: LlmStreamChatParams) {
    if (stream.cancelledByUser) {
      clearTimeout(stream.timeout)
      this.streams.delete(stream.id)
      return
    }

    try {
      if (stream.model.configType === "managed-local") {
        await this.streamManagedLocalModel(stream, params)
      } else if (resolveConfigProtocol(stream.model) === "anthropic") {
        await this.streamAnthropicModel(stream, params)
      } else {
        await this.streamOpenAiModel(stream, params)
      }

      if (!stream.cancelledByUser) {
        this.sendStreamEnd(stream)
      }
    } catch (error) {
      if (stream.cancelledByUser) {
        return
      }

      const abortMessage = this.resolveAbortMessage(stream)

      if (abortMessage) {
        this.sendStreamError(stream, abortMessage)
        return
      }

      this.sendStreamError(
        stream,
        error instanceof Error && error.message.trim() ? error.message : this.aiWriteMessages.requestFailed,
      )
    } finally {
      clearTimeout(stream.timeout)
      this.streams.delete(stream.id)
    }
  }

  private async streamManagedLocalModel(stream: ActiveInferenceStream, params: LlmStreamChatParams) {
    const managedModelId = stream.model.managedModelId

    if (!managedModelId) {
      throw new Error(this.aiWriteMessages.requestFailed)
    }

    await this.localModelManager.streamManagedLocalResponse({
      modelId: managedModelId,
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      signal: stream.controller.signal,
      onTextChunk: (chunk) => {
        this.sendStreamChunk(stream, chunk)
      },
    })
  }

  private async streamOpenAiModel(stream: ActiveInferenceStream, params: LlmStreamChatParams) {
    const modelName = this.requireModelName(stream.model)
    const endpoint = this.requireEndpoint(stream.model)
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (stream.model.apiKey.trim()) {
      headers.Authorization = `Bearer ${stream.model.apiKey}`
    }

    const messages: Array<{ role: "system" | "user"; content: string }> = []

    if (params.systemPrompt.trim()) {
      messages.push({
        role: "system",
        content: params.systemPrompt,
      })
    }

    messages.push({
      role: "user",
      content: params.userPrompt,
    })

    const response = await fetch(this.buildEndpointUrl(endpoint, "chat/completions"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelName,
        messages,
        stream: true,
        max_tokens: REMOTE_STREAM_MAX_TOKENS,
      }),
      signal: stream.controller.signal,
    })

    if (!response.ok) {
      throw new Error(await this.readResponseError(response))
    }

    await this.consumeSseStream(response, ({ data }) => {
      if (data === "[DONE]") {
        return
      }

      const payload = JSON.parse(data) as {
        choices?: Array<{
          delta?: {
            content?: unknown
          }
        }>
      }
      const chunk = this.extractTextContent(payload.choices?.[0]?.delta?.content)

      if (chunk) {
        this.sendStreamChunk(stream, chunk)
      }
    })
  }

  private async streamAnthropicModel(stream: ActiveInferenceStream, params: LlmStreamChatParams) {
    const modelName = this.requireModelName(stream.model)
    const endpoint = this.requireEndpoint(stream.model)
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    }

    if (stream.model.apiKey.trim()) {
      headers["x-api-key"] = stream.model.apiKey
    }

    const response = await fetch(this.buildEndpointUrl(endpoint, "messages"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelName,
        system: params.systemPrompt.trim() || undefined,
        messages: [
          {
            role: "user",
            content: params.userPrompt,
          },
        ],
        stream: true,
        max_tokens: REMOTE_STREAM_MAX_TOKENS,
      }),
      signal: stream.controller.signal,
    })

    if (!response.ok) {
      throw new Error(await this.readResponseError(response))
    }

    await this.consumeSseStream(response, ({ event, data }) => {
      const payload = JSON.parse(data) as {
        type?: string
        delta?: {
          text?: string
        }
        error?: {
          message?: string
        }
        message?: string
      }
      const eventType = event || payload.type || "message"

      if (eventType === "error") {
        throw new Error(payload.error?.message || payload.message || this.aiWriteMessages.requestFailed)
      }

      if (eventType !== "content_block_delta") {
        return
      }

      const chunk = payload.delta?.text ?? ""

      if (chunk) {
        this.sendStreamChunk(stream, chunk)
      }
    })
  }

  private sendStreamChunk(stream: ActiveInferenceStream, chunk: string) {
    if (chunk.length === 0) {
      return
    }

    this.sendToRenderer<LlmStreamChunkPayload>(stream.sender, "llm:streamChunk", {
      streamId: stream.id,
      chunk,
    })
  }

  private sendStreamEnd(stream: ActiveInferenceStream) {
    this.sendToRenderer<LlmStreamEndPayload>(stream.sender, "llm:streamEnd", {
      streamId: stream.id,
    })
  }

  private sendStreamError(stream: ActiveInferenceStream, error: string) {
    this.sendToRenderer<LlmStreamErrorPayload>(stream.sender, "llm:streamError", {
      streamId: stream.id,
      error,
    })
  }

  private sendToRenderer<T>(sender: WebContents, channel: string, payload: T) {
    if (sender.isDestroyed()) {
      return
    }

    sender.send(channel, payload)
  }

  private resolveAbortMessage(stream: ActiveInferenceStream) {
    if (!stream.controller.signal.aborted) {
      return null
    }

    const reason = stream.controller.signal.reason

    if (reason instanceof Error && reason.message.trim()) {
      return reason.message
    }

    return this.aiWriteMessages.requestFailed
  }

  private requireModelName(model: LlmModelConfig) {
    const modelName = resolveRequestModelName(model).trim()

    if (modelName) {
      return modelName
    }

    throw new Error(model.configType === "builtin" ? this.modelMessages.errors.invalidPreset : this.modelMessages.errors.missingModelName)
  }

  private requireEndpoint(model: LlmModelConfig) {
    const endpoint = resolveConfigEndpoint(model).trim()

    if (endpoint) {
      return endpoint
    }

    throw new Error(this.modelMessages.errors.missingEndpoint)
  }

  private buildEndpointUrl(endpoint: string, resourcePath: string) {
    return endpoint.endsWith(`/${resourcePath}`) ? endpoint : `${endpoint}/${resourcePath}`
  }

  private async consumeSseStream(
    response: Response,
    onEvent: (payload: SseEventPayload) => void | Promise<void>,
  ) {
    if (!response.body) {
      throw new Error(this.aiWriteMessages.requestFailed)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        const { done, value } = await reader.read()

        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
        const normalized = buffer.replace(/\r\n/g, "\n")
        const parts = normalized.split("\n\n")
        buffer = parts.pop() ?? ""

        for (const rawEvent of parts) {
          await this.handleSseEvent(rawEvent, onEvent)
        }

        if (done) {
          break
        }
      }

      const finalEvent = buffer.replace(/\r\n/g, "\n").trim()

      if (finalEvent) {
        await this.handleSseEvent(finalEvent, onEvent)
      }
    } finally {
      reader.releaseLock()
    }
  }

  private async handleSseEvent(
    rawEvent: string,
    onEvent: (payload: SseEventPayload) => void | Promise<void>,
  ) {
    const lines = rawEvent.split("\n")
    let event = "message"
    const dataParts: string[] = []

    for (const line of lines) {
      if (!line || line.startsWith(":")) {
        continue
      }

      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim()
        continue
      }

      if (line.startsWith("data:")) {
        dataParts.push(line.slice("data:".length).trimStart())
      }
    }

    const data = dataParts.join("\n").trim()

    if (!data) {
      return
    }

    await onEvent({
      event,
      data,
    })
  }

  private extractTextContent(content: unknown): string {
    if (typeof content === "string") {
      return content
    }

    if (!Array.isArray(content)) {
      return ""
    }

    return content
      .map((part) => {
        if (typeof part === "string") {
          return part
        }

        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text
        }

        return ""
      })
      .join("")
  }

  private async readResponseError(response: Response) {
    const raw = await response.text()

    if (!raw.trim()) {
      return `${response.status} ${response.statusText}`
    }

    try {
      const payload = JSON.parse(raw) as {
        error?: {
          message?: string
        }
        message?: string
      }

      return payload.error?.message || payload.message || raw
    } catch {
      return raw
    }
  }
}
