import type { Editor } from "@tiptap/react"

export interface SlashCommandMatch {
  query: string
  range: {
    from: number
    to: number
  }
}

export interface NoteLinkTriggerMatch {
  query: string
  range: {
    from: number
    to: number
  }
}

export function getSlashCommandMatch(editor: Editor | null): SlashCommandMatch | null {
  if (!editor || !editor.isEditable || !editor.state.selection.empty) {
    return null
  }

  const { $from, from } = editor.state.selection

  if (!$from.parent.isTextblock || $from.parent.type.name !== "paragraph") {
    return null
  }

  if ($from.parentOffset <= 0) {
    return null
  }

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "", "")

  if (!textBefore.startsWith("/")) {
    return null
  }

  return {
    query: textBefore.slice(1),
    range: {
      from: $from.start(),
      to: from,
    },
  }
}

export function matchesSlashCommandQuery(query: string, candidates: string[]) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return true
  }

  return candidates.some((candidate) => candidate.toLowerCase().includes(normalizedQuery))
}

export function getNoteLinkTriggerMatch(editor: Editor | null): NoteLinkTriggerMatch | null {
  if (!editor || !editor.isEditable || !editor.state.selection.empty) {
    return null
  }

  const { $from, from } = editor.state.selection

  if (!$from.parent.isTextblock || $from.parent.type.name !== "paragraph") {
    return null
  }

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "", "")
  const match = textBefore.match(/\[\[([^[\]]*)$/)

  if (!match) {
    return null
  }

  const token = match[0] ?? ""

  return {
    query: match[1] ?? "",
    range: {
      from: from - token.length,
      to: from,
    },
  }
}
