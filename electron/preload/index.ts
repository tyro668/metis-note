import { contextBridge, ipcRenderer } from "electron"
import type {
  LlmConnectionResult,
  LlmModelConfig,
  LlmStreamChatParams,
  LlmStreamChunkPayload,
  LlmStreamEndPayload,
  LlmStreamErrorPayload,
  LlmStreamStartResult,
  SaveLlmModelInput,
} from "../../src/shared/llm"
import type { CreateNoteInput, NoteLinkResolutionMap, NoteSummary, UpdateNoteInput } from "../../src/shared/notes"

contextBridge.exposeInMainWorld("metisNote", {
  notes: {
    list: () => ipcRenderer.invoke("notes:list"),
    get: (id: string) => ipcRenderer.invoke("notes:get", id),
    create: (payload?: CreateNoteInput) => ipcRenderer.invoke("notes:create", payload),
    update: (id: string, payload: UpdateNoteInput) => ipcRenderer.invoke("notes:update", id, payload),
    trash: (id: string) => ipcRenderer.invoke("notes:trash", id),
    restore: (id: string) => ipcRenderer.invoke("notes:restore", id),
    duplicate: (id: string) => ipcRenderer.invoke("notes:duplicate", id),
    deleteForever: (id: string) => ipcRenderer.invoke("notes:deleteForever", id),
    importMarkdown: (payload?: CreateNoteInput) => ipcRenderer.invoke("notes:importMarkdown", payload),
    exportMarkdown: (id: string) => ipcRenderer.invoke("notes:exportMarkdown", id),
  },
  noteLinks: {
    getBacklinks: (noteId: string) => ipcRenderer.invoke("noteLinks:getBacklinks", noteId) as Promise<NoteSummary[]>,
    resolveLinks: (noteIds: string[]) => ipcRenderer.invoke("noteLinks:resolveLinks", noteIds) as Promise<NoteLinkResolutionMap>,
  },
  llmModels: {
    list: () => ipcRenderer.invoke("llmModels:list") as Promise<LlmModelConfig[]>,
    create: (payload: SaveLlmModelInput) => ipcRenderer.invoke("llmModels:create", payload) as Promise<LlmModelConfig>,
    addManagedLocal: (modelId: string) =>
      ipcRenderer.invoke("llmModels:addManagedLocal", modelId) as Promise<LlmModelConfig>,
    update: (id: string, payload: SaveLlmModelInput) =>
      ipcRenderer.invoke("llmModels:update", id, payload) as Promise<LlmModelConfig>,
    enable: (id: string) => ipcRenderer.invoke("llmModels:enable", id) as Promise<LlmModelConfig>,
    delete: (id: string) => ipcRenderer.invoke("llmModels:delete", id) as Promise<LlmModelConfig>,
    testConnection: (id: string) => ipcRenderer.invoke("llmModels:testConnection", id) as Promise<LlmConnectionResult>,
  },
  llm: {
    startStreamChat: (params: LlmStreamChatParams) =>
      ipcRenderer.invoke("llm:startStreamChat", params) as Promise<LlmStreamStartResult>,
    cancelStream: (streamId: string) => ipcRenderer.invoke("llm:cancelStream", streamId) as Promise<void>,
    onStreamChunk: (callback: (streamId: string, chunk: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: LlmStreamChunkPayload) => {
        callback(payload.streamId, payload.chunk)
      }

      ipcRenderer.on("llm:streamChunk", handler)

      return () => {
        ipcRenderer.removeListener("llm:streamChunk", handler)
      }
    },
    onStreamEnd: (callback: (streamId: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: LlmStreamEndPayload) => {
        callback(payload.streamId)
      }

      ipcRenderer.on("llm:streamEnd", handler)

      return () => {
        ipcRenderer.removeListener("llm:streamEnd", handler)
      }
    },
    onStreamError: (callback: (streamId: string, error: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: LlmStreamErrorPayload) => {
        callback(payload.streamId, payload.error)
      }

      ipcRenderer.on("llm:streamError", handler)

      return () => {
        ipcRenderer.removeListener("llm:streamError", handler)
      }
    },
  },
})
