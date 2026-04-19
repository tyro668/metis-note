import type { JSONContent } from "@tiptap/core"

export interface VersionSummary {
  timestamp: string
  wordCount: number
  previewText: string
}

export type NoteVersionContent = JSONContent
