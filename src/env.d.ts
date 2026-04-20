/// <reference types="vite/client" />

import type { FileAssetResult, ImageAssetResult, RendererAssetImportPayload } from "./shared/assets"
import type {
  LlmConnectionResult,
  LlmModelConfig,
  LlmStreamChatParams,
  LlmStreamStartResult,
  SaveLlmModelInput,
} from "./shared/llm"
import type {
  CreateNoteInput,
  DeleteNoteResult,
  ExportNoteResult,
  ImportNoteResult,
  NoteLinkResolutionMap,
  NoteDocument,
  NoteSummary,
  UpdateNoteInput,
} from "./shared/notes"
import type { SaveTemplateInput, TemplateDocument, TemplateSummary } from "./shared/templates"
import type { AppUpdateCheckResult, AppUpdateCurrentInfo, AppUpdateDownloadResult } from "./shared/updates"
import type { NoteVersionContent, VersionSummary } from "./shared/versions"
import type {
  BaiduPanAuthResult,
  ConflictResolution,
  GoogleDriveAuthResult,
  NoteSyncStateMap,
  SyncConfig,
  SyncConflict,
  SyncResult,
  SyncStatus,
} from "./shared/sync"

declare global {
  interface Window {
    metisNote: {
      notes: {
        list: () => Promise<NoteSummary[]>
        get: (id: string) => Promise<NoteDocument | null>
        create: (payload?: CreateNoteInput) => Promise<NoteDocument>
        update: (id: string, payload: UpdateNoteInput) => Promise<NoteDocument>
        trash: (id: string) => Promise<NoteDocument>
        restore: (id: string) => Promise<NoteDocument>
        duplicate: (id: string) => Promise<NoteDocument>
        deleteForever: (id: string) => Promise<DeleteNoteResult>
        importMarkdown: (payload?: CreateNoteInput) => Promise<ImportNoteResult>
        exportMarkdown: (id: string) => Promise<ExportNoteResult>
        exportPdf: (id: string) => Promise<ExportNoteResult>
        print: (id: string) => Promise<void>
      }
      noteLinks: {
        getBacklinks: (noteId: string) => Promise<NoteSummary[]>
        resolveLinks: (noteIds: string[]) => Promise<NoteLinkResolutionMap>
      }
      versions: {
        list: (noteId: string) => Promise<VersionSummary[]>
        get: (noteId: string, timestamp: string) => Promise<NoteVersionContent | null>
        restore: (noteId: string, timestamp: string) => Promise<NoteDocument>
      }
      templates: {
        list: () => Promise<TemplateSummary[]>
        get: (id: string) => Promise<TemplateDocument | null>
        createFromNote: (noteId: string, payload: SaveTemplateInput) => Promise<TemplateDocument>
        update: (id: string, payload: SaveTemplateInput) => Promise<TemplateDocument>
        delete: (id: string) => Promise<TemplateDocument>
      }
      assets: {
        importImage: (payload: RendererAssetImportPayload) => Promise<ImageAssetResult>
        importFile: (payload: RendererAssetImportPayload) => Promise<FileAssetResult>
        pickAndImportImage: (noteId: string) => Promise<ImageAssetResult | null>
        pickAndImportFile: (noteId: string) => Promise<FileAssetResult | null>
        openFile: (source: string) => Promise<void>
      }
      llmModels: {
        list: () => Promise<LlmModelConfig[]>
        create: (payload: SaveLlmModelInput) => Promise<LlmModelConfig>
        addManagedLocal: (modelId: string) => Promise<LlmModelConfig>
        update: (id: string, payload: SaveLlmModelInput) => Promise<LlmModelConfig>
        enable: (id: string) => Promise<LlmModelConfig>
        delete: (id: string) => Promise<LlmModelConfig>
        testConnection: (id: string) => Promise<LlmConnectionResult>
      }
      llm: {
        startStreamChat: (params: LlmStreamChatParams) => Promise<LlmStreamStartResult>
        cancelStream: (streamId: string) => Promise<void>
        onStreamChunk: (callback: (streamId: string, chunk: string) => void) => () => void
        onStreamEnd: (callback: (streamId: string) => void) => () => void
        onStreamError: (callback: (streamId: string, error: string) => void) => () => void
      }
      updates: {
        getCurrentInfo: () => Promise<AppUpdateCurrentInfo>
        check: () => Promise<AppUpdateCheckResult>
        downloadLatest: () => Promise<AppUpdateDownloadResult>
        openReleasePage: (releasePageUrl?: string) => Promise<void>
      }
      sync: {
        getStatus: () => Promise<SyncStatus>
        getConfig: () => Promise<SyncConfig | null>
        configure: (config: SyncConfig) => Promise<void>
        authorizeBaiduPan: () => Promise<BaiduPanAuthResult>
        authorizeGoogleDrive: (clientId: string) => Promise<GoogleDriveAuthResult>
        syncNow: () => Promise<SyncResult>
        setPassphrase: (passphrase: string) => Promise<void>
        clearPassphrase: () => Promise<void>
        getPendingConflicts: () => Promise<SyncConflict[]>
        getNoteSyncStates: () => Promise<NoteSyncStateMap>
        resolveConflict: (conflictId: string, resolution: ConflictResolution) => Promise<void>
        onStatusChanged: (callback: (status: SyncStatus) => void) => () => void
        onSyncCompleted: (callback: (result: SyncResult) => void) => () => void
      }
    }
  }
}

export {}
