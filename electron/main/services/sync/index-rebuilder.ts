import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { JSONContent } from "@tiptap/core"

import {
  buildPreview,
  countWords,
  extractPlainTextFromContent,
  normalizeTags,
  normalizeTitle,
  type NoteSummary,
} from "../../../../src/shared/notes"
import type { AppLocale } from "../../../../src/shared/i18n"

interface NoteIndexPayload {
  version: 4
  notes: NoteSummary[]
}

/**
 * Rebuild index.json from items/*.json files.
 * This ensures the index is always derived from the note content files (single source of truth).
 */
export async function rebuildIndexFromItems(
  baseDir: string,
  locale: AppLocale,
): Promise<NoteSummary[]> {
  const itemsDir = path.join(baseDir, "items")
  const indexPath = path.join(baseDir, "index.json")

  // Read existing index for metadata not derivable from content (parentId, isPinned, status, tags, etc.)
  let existingIndex: NoteSummary[] = []

  try {
    const indexData = await readFile(indexPath, "utf-8")
    const parsed = JSON.parse(indexData) as NoteIndexPayload

    if (parsed.version === 4 && Array.isArray(parsed.notes)) {
      existingIndex = parsed.notes
    }
  } catch {
    // No existing index
  }

  const existingMap = new Map(existingIndex.map((n) => [n.id, n]))

  // Scan items directory
  let files: string[]

  try {
    files = await readdir(itemsDir)
  } catch {
    // No items directory yet
    const payload: NoteIndexPayload = { version: 4, notes: [] }
    await writeFile(indexPath, JSON.stringify(payload, null, 2))
    return []
  }

  const summaries: NoteSummary[] = []

  for (const file of files) {
    if (!file.endsWith(".json")) continue

    const noteId = file.replace(".json", "")
    const filePath = path.join(itemsDir, file)

    try {
      const data = await readFile(filePath, "utf-8")
      const content = JSON.parse(data) as JSONContent
      const existing = existingMap.get(noteId)

      const plainText = extractPlainTextFromContent(content)
      const title = normalizeTitle(extractTitleFromContent(content), locale)
      const preview = buildPreview(plainText)
      const wordCount = countWords(plainText)
      const now = new Date().toISOString()

      summaries.push({
        id: noteId,
        parentId: existing?.parentId ?? null,
        title,
        preview,
        plainText,
        createdAt: existing?.createdAt ?? now,
        updatedAt: existing?.updatedAt ?? now,
        wordCount,
        isPinned: existing?.isPinned ?? false,
        isFavorite: existing?.isFavorite ?? false,
        status: existing?.status ?? "active",
        tags: existing?.tags ?? [],
        workspace: existing?.workspace ?? "personal",
        workspaceName: existing?.workspaceName ?? "",
        visibility: existing?.visibility ?? "private",
      })
    } catch {
      // Skip corrupted note files
    }
  }

  const existingOrder = new Map(existingIndex.map((note, index) => [note.id, index]))

  // Sanitize hierarchy: orphan parentId references
  const idSet = new Set(summaries.map((s) => s.id))

  for (const summary of summaries) {
    if (summary.parentId && !idSet.has(summary.parentId)) {
      summary.parentId = null
    }
  }

  summaries.sort((left, right) => {
    const leftOrder = existingOrder.get(left.id)
    const rightOrder = existingOrder.get(right.id)

    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder
    }

    if (leftOrder !== undefined) {
      return -1
    }

    if (rightOrder !== undefined) {
      return 1
    }

    return left.id.localeCompare(right.id)
  })

  const payload: NoteIndexPayload = { version: 4, notes: summaries }
  await writeFile(indexPath, JSON.stringify(payload, null, 2))

  return summaries
}

/**
 * Extract title from TipTap JSONContent (first heading or first paragraph text).
 */
function extractTitleFromContent(content: JSONContent): string {
  if (!content.content) return ""

  for (const node of content.content) {
    if (node.type === "heading" && node.content) {
      return extractTextFromNode(node)
    }
  }

  for (const node of content.content) {
    if (node.type === "paragraph" && node.content) {
      const text = extractTextFromNode(node)

      if (text.trim()) return text
    }
  }

  return ""
}

function extractTextFromNode(node: JSONContent): string {
  if (node.type === "text" && node.text) return node.text

  if (node.content) {
    return node.content.map(extractTextFromNode).join("")
  }

  return ""
}
