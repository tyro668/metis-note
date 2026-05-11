import { contextBridge, ipcRenderer } from "electron"
import type { FileAssetResult, ImageAssetResult, RendererAssetImportPayload } from "../../src/shared/assets"
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
import type { SaveTemplateInput, TemplateDocument, TemplateSummary } from "../../src/shared/templates"
import type {
  AppUpdateCheckResult,
  AppUpdateCurrentInfo,
  AppUpdateInstallResult,
} from "../../src/shared/updates"
import type { NoteVersionContent, VersionSummary } from "../../src/shared/versions"
import type {
  BaiduPanAuthResult,
  ConflictResolution,
  GoogleDriveAuthResult,
  NoteSyncStateMap,
  SyncConfig,
  SyncConflict,
  SyncResult,
  SyncStatus,
} from "../../src/shared/sync"

function normalizeAssetPayload(payload: RendererAssetImportPayload) {
  return {
    ...payload,
    bytes:
      payload.bytes instanceof Uint8Array
        ? payload.bytes
        : payload.bytes
          ? new Uint8Array(payload.bytes)
          : undefined,
  }
}

function withIpcSubscription<T>(channel: string, callback: (payload: T) => void) {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => {
    callback(payload)
  }

  ipcRenderer.on(channel, handler)

  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

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
    exportPdf: (id: string) => ipcRenderer.invoke("notes:exportPdf", id),
    print: (id: string) => ipcRenderer.invoke("notes:print", id),
  },
  noteLinks: {
    getBacklinks: (noteId: string) => ipcRenderer.invoke("noteLinks:getBacklinks", noteId) as Promise<NoteSummary[]>,
    resolveLinks: (noteIds: string[]) => ipcRenderer.invoke("noteLinks:resolveLinks", noteIds) as Promise<NoteLinkResolutionMap>,
  },
  versions: {
    list: (noteId: string) => ipcRenderer.invoke("versions:list", noteId) as Promise<VersionSummary[]>,
    get: (noteId: string, timestamp: string) => ipcRenderer.invoke("versions:get", noteId, timestamp) as Promise<NoteVersionContent | null>,
    restore: (noteId: string, timestamp: string) => ipcRenderer.invoke("versions:restore", noteId, timestamp),
  },
  templates: {
    list: () => ipcRenderer.invoke("templates:list") as Promise<TemplateSummary[]>,
    get: (id: string) => ipcRenderer.invoke("templates:get", id) as Promise<TemplateDocument | null>,
    createFromNote: (noteId: string, payload: SaveTemplateInput) =>
      ipcRenderer.invoke("templates:createFromNote", noteId, payload) as Promise<TemplateDocument>,
    update: (id: string, payload: SaveTemplateInput) => ipcRenderer.invoke("templates:update", id, payload) as Promise<TemplateDocument>,
    delete: (id: string) => ipcRenderer.invoke("templates:delete", id) as Promise<TemplateDocument>,
  },
  assets: {
    importImage: (payload: RendererAssetImportPayload) =>
      ipcRenderer.invoke("assets:importImage", normalizeAssetPayload(payload)) as Promise<ImageAssetResult>,
    importFile: (payload: RendererAssetImportPayload) =>
      ipcRenderer.invoke("assets:importFile", normalizeAssetPayload(payload)) as Promise<FileAssetResult>,
    pickAndImportImage: (noteId: string) => ipcRenderer.invoke("assets:pickAndImportImage", noteId) as Promise<ImageAssetResult | null>,
    pickAndImportFile: (noteId: string) => ipcRenderer.invoke("assets:pickAndImportFile", noteId) as Promise<FileAssetResult | null>,
    openFile: (source: string) => ipcRenderer.invoke("assets:openFile", source) as Promise<void>,
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
  updates: {
    getCurrentInfo: () => ipcRenderer.invoke("updates:getCurrentInfo") as Promise<AppUpdateCurrentInfo>,
    check: () => ipcRenderer.invoke("updates:check") as Promise<AppUpdateCheckResult>,
    installLatest: () => ipcRenderer.invoke("updates:installLatest") as Promise<AppUpdateInstallResult>,
    openReleasePage: (releasePageUrl?: string) => ipcRenderer.invoke("updates:openReleasePage", releasePageUrl) as Promise<void>,
  },
  sync: {
    getStatus: () => ipcRenderer.invoke("sync:getStatus") as Promise<SyncStatus>,
    getConfig: () => ipcRenderer.invoke("sync:getConfig") as Promise<SyncConfig | null>,
    configure: (config: SyncConfig) => ipcRenderer.invoke("sync:configure", config) as Promise<void>,
    authorizeBaiduPan: () => ipcRenderer.invoke("sync:authorizeBaiduPan") as Promise<BaiduPanAuthResult>,
    authorizeGoogleDrive: (clientId: string) =>
      ipcRenderer.invoke("sync:authorizeGoogleDrive", clientId) as Promise<GoogleDriveAuthResult>,
    syncNow: () => ipcRenderer.invoke("sync:syncNow") as Promise<SyncResult>,
    setPassphrase: (passphrase: string) => ipcRenderer.invoke("sync:setPassphrase", passphrase) as Promise<void>,
    clearPassphrase: () => ipcRenderer.invoke("sync:clearPassphrase") as Promise<void>,
    getPendingConflicts: () => ipcRenderer.invoke("sync:getPendingConflicts") as Promise<SyncConflict[]>,
    getNoteSyncStates: () => ipcRenderer.invoke("sync:getNoteSyncStates") as Promise<NoteSyncStateMap>,
    resolveConflict: (conflictId: string, resolution: ConflictResolution) =>
      ipcRenderer.invoke("sync:resolveConflict", conflictId, resolution) as Promise<void>,
    onStatusChanged: (callback: (status: SyncStatus) => void) => withIpcSubscription("sync:statusChanged", callback),
    onSyncCompleted: (callback: (result: SyncResult) => void) => withIpcSubscription("sync:syncCompleted", callback),
  },
})
