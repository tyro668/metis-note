/// <reference types="vite/client" />

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
      }
      noteLinks: {
        getBacklinks: (noteId: string) => Promise<NoteSummary[]>
        resolveLinks: (noteIds: string[]) => Promise<NoteLinkResolutionMap>
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
    }
  }
}

export {}
