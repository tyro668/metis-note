import type { JSONContent } from "@tiptap/core"
import { DEFAULT_LOCALE, getMessages, type AppLocale } from "./i18n"

export const RECENT_NOTE_DAYS = 7

export type NoteStatus = "active" | "trashed"
export type NoteWorkspace = "personal" | "team"
export type NoteVisibility = "private" | "public"
export type NoteView = "favorites" | "all" | "trash"
export const METIS_NOTE_LINK_PREFIX = "metis-note://note/"

export interface NoteSummary {
  id: string
  parentId: string | null
  title: string
  preview: string
  plainText: string
  createdAt: string
  updatedAt: string
  wordCount: number
  isPinned: boolean
  isFavorite: boolean
  status: NoteStatus
  tags: string[]
  workspace: NoteWorkspace
  workspaceName: string
  visibility: NoteVisibility
}

export interface NoteDocument extends NoteSummary {
  content: JSONContent
}

export interface CreateNoteInput {
  parentId?: string | null
  title?: string
  content?: JSONContent
  plainText?: string
  tags?: string[]
  isPinned?: boolean
  isFavorite?: boolean
  workspace?: NoteWorkspace
  workspaceName?: string
  visibility?: NoteVisibility
}

export interface UpdateNoteInput {
  parentId?: string | null
  title?: string
  content?: JSONContent
  plainText?: string
  isPinned?: boolean
  isFavorite?: boolean
  status?: NoteStatus
  tags?: string[]
  workspace?: NoteWorkspace
  workspaceName?: string
  visibility?: NoteVisibility
}

export interface DeleteNoteResult {
  deletedId: string
  nextNoteId: string | null
}

export interface ImportNoteResult {
  filePath: string | null
  note: NoteDocument | null
}

export interface ExportNoteResult {
  filePath: string | null
}

export interface NoteLinkResolution {
  title: string
  exists: boolean
}

export type NoteLinkResolutionMap = Record<string, NoteLinkResolution>

export function normalizeTitle(title?: string, locale: AppLocale = DEFAULT_LOCALE) {
  return title?.trim() || getMessages(locale).notes.emptyTitle
}

export function normalizeWorkspaceName(workspace: NoteWorkspace, workspaceName?: string, locale: AppLocale = DEFAULT_LOCALE) {
  const noteMessages = getMessages(locale).notes
  const fallback = workspace === "team" ? noteMessages.workspaceTeam : noteMessages.workspacePersonal

  return workspaceName?.trim() || fallback
}

export function normalizeTags(tags: string[]) {
  const unique = new Set<string>()

  for (const rawTag of tags) {
    const tag = rawTag.trim()

    if (!tag) {
      continue
    }

    unique.add(tag.slice(0, 24))
  }

  return [...unique].slice(0, 8)
}

export function parseTagInput(value: string) {
  return normalizeTags(value.split(/[，,\n]/))
}

export function createEmptyDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
      },
    ],
  }
}

export function createWelcomeDocument(locale: AppLocale = DEFAULT_LOCALE): JSONContent {
  const welcomeMessages = getMessages(locale).notes.welcome

  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: {
          level: 1,
        },
        content: [
          {
            type: "text",
            text: welcomeMessages.heading,
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: welcomeMessages.description,
          },
        ],
      },
      {
        type: "heading",
        attrs: {
          level: 2,
        },
        content: [
          {
            type: "text",
            text: welcomeMessages.supportedHeading,
          },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: welcomeMessages.supportedItems[0] ?? "",
                  },
                ],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: welcomeMessages.supportedItems[1] ?? "",
                  },
                ],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: welcomeMessages.supportedItems[2] ?? "",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: welcomeMessages.quote,
              },
            ],
          },
        ],
      },
    ],
  }
}

export function buildPreview(text: string, locale: AppLocale = DEFAULT_LOCALE) {
  const normalized = text.replace(/\s+/g, " ").trim()

  return normalized.slice(0, 96) || getMessages(locale).notes.defaultPreview
}

export function countWords(text: string) {
  return text.replace(/\s+/g, "").length
}

export function extractPlainTextFromContent(content: JSONContent | null | undefined) {
  const parts: string[] = []
  const blockTypes = new Set([
    "paragraph",
    "heading",
    "blockquote",
    "bulletList",
    "orderedList",
    "taskList",
    "taskItem",
    "listItem",
    "table",
    "tableRow",
    "tableCell",
    "tableHeader",
    "codeBlock",
    "mathBlock",
    "details",
    "detailsSummary",
    "detailsContent",
    "horizontalRule",
    "image",
    "fileAttachment",
  ])

  function append(value: string | null | undefined) {
    if (!value) {
      return
    }

    parts.push(value)
  }

  function visit(node: JSONContent | null | undefined) {
    if (!node) {
      return
    }

    switch (node.type) {
      case "text":
        append(node.text)
        break
      case "noteLink":
        append(typeof node.attrs?.title === "string" ? node.attrs.title : "")
        break
      case "image":
        append(typeof node.attrs?.alt === "string" ? node.attrs.alt : "")
        break
      case "fileAttachment":
        append(typeof node.attrs?.filename === "string" ? node.attrs.filename : "")
        break
      case "mathBlock":
        append(typeof node.attrs?.latex === "string" ? node.attrs.latex : "")
        break
      case "horizontalRule":
        append("\n")
        break
      default:
        break
    }

    for (const child of node.content ?? []) {
      visit(child)
    }

    if (node.type && blockTypes.has(node.type)) {
      append("\n")
    }
  }

  visit(content ?? undefined)

  return parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
}

export function isRecentDate(value: string, days = RECENT_NOTE_DAYS) {
  const ageMs = Date.now() - Date.parse(value)

  return ageMs <= days * 24 * 60 * 60 * 1000
}

export function buildNotePathTitles(notes: Pick<NoteSummary, "id" | "parentId" | "title">[], noteId: string | null) {
  if (!noteId) {
    return []
  }

  const byId = new Map(notes.map((note) => [note.id, note]))
  const path: string[] = []
  const visited = new Set<string>()
  let currentId: string | null = noteId

  while (currentId && byId.has(currentId) && !visited.has(currentId)) {
    const current = byId.get(currentId)

    if (!current) {
      break
    }

    path.unshift(current.title)
    visited.add(currentId)
    currentId = current.parentId
  }

  return path
}

export function buildNoteLinkHref(noteId: string) {
  return `${METIS_NOTE_LINK_PREFIX}${encodeURIComponent(noteId)}`
}

export function parseNoteLinkHref(href: string) {
  if (!href.startsWith(METIS_NOTE_LINK_PREFIX)) {
    return null
  }

  const encodedId = href.slice(METIS_NOTE_LINK_PREFIX.length).trim()

  if (!encodedId) {
    return null
  }

  try {
    return decodeURIComponent(encodedId)
  } catch {
    return null
  }
}

export function createNoteLinkNode(noteId: string, title?: string, locale: AppLocale = DEFAULT_LOCALE): JSONContent {
  return {
    type: "noteLink",
    attrs: {
      noteId,
      title: normalizeTitle(title, locale),
    },
  }
}

export function extractNoteLinkIds(content: JSONContent | null | undefined) {
  const noteIds: string[] = []
  const seen = new Set<string>()

  function visit(node: JSONContent | undefined) {
    if (!node) {
      return
    }

    if (node.type === "noteLink" && typeof node.attrs?.noteId === "string" && node.attrs.noteId.trim()) {
      const noteId = node.attrs.noteId.trim()

      if (!seen.has(noteId)) {
        seen.add(noteId)
        noteIds.push(noteId)
      }
    }

    for (const child of node.content ?? []) {
      visit(child)
    }
  }

  visit(content ?? undefined)

  return noteIds
}
