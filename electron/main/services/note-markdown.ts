import path from "node:path"
import type { JSONContent } from "@tiptap/core"
import {
  buildNoteLinkHref,
  createNoteLinkNode,
  parseNoteLinkHref,
  type CreateNoteInput,
  type NoteDocument,
} from "../../../src/shared/notes"

type JSONMark = NonNullable<JSONContent["marks"]>[number]

const URL_PATTERN = /\bhttps?:\/\/[^\s<]+[^\s<.,:;"')\]]/gi

function createTextNode(text: string, marks?: JSONMark[]) {
  return marks?.length ? { type: "text", text, marks } : { type: "text", text }
}

function applyMark(nodes: JSONContent[], mark: JSONMark) {
  return nodes.map((node) => {
    if (node.type !== "text") {
      return node
    }

    return {
      ...node,
      marks: [...(node.marks ?? []), mark],
    }
  })
}

function appendPlainText(nodes: JSONContent[], text: string) {
  if (!text) {
    return
  }

  let cursor = 0

  for (const match of text.matchAll(URL_PATTERN)) {
    const value = match[0]
    const index = match.index ?? 0

    if (index > cursor) {
      nodes.push(createTextNode(text.slice(cursor, index)))
    }

    nodes.push(
      createTextNode(value, [
        {
          type: "link",
          attrs: {
            href: value,
          },
        },
      ]),
    )
    cursor = index + value.length
  }

  if (cursor < text.length) {
    nodes.push(createTextNode(text.slice(cursor)))
  }
}

function findClosingToken(text: string, token: string, startIndex: number) {
  let index = startIndex

  while (index < text.length) {
    const position = text.indexOf(token, index)

    if (position === -1) {
      return -1
    }

    if (position === 0 || text[position - 1] !== "\\") {
      return position
    }

    index = position + token.length
  }

  return -1
}

function readBalancedSegment(text: string, startIndex: number, openChar: string, closeChar: string) {
  if (text[startIndex] !== openChar) {
    return null
  }

  let depth = 0
  let value = ""

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index] ?? ""

    if (char === "\\" && index + 1 < text.length) {
      value += text[index + 1] ?? ""
      index += 1
      continue
    }

    if (char === openChar) {
      depth += 1

      if (depth > 1) {
        value += char
      }

      continue
    }

    if (char === closeChar) {
      depth -= 1

      if (depth === 0) {
        return {
          value,
          endIndex: index + 1,
        }
      }

      value += char
      continue
    }

    value += char
  }

  return null
}

function normalizeLinkTarget(rawTarget: string) {
  const trimmed = rawTarget.trim()

  if (!trimmed) {
    return null
  }

  if (trimmed.startsWith("<")) {
    const endIndex = trimmed.indexOf(">")

    if (endIndex <= 1) {
      return null
    }

    return trimmed.slice(1, endIndex).trim() || null
  }

  const [href] = trimmed.split(/\s+/, 1)

  return href?.trim() || null
}

function readMarkdownLink(text: string, startIndex: number) {
  const label = readBalancedSegment(text, startIndex, "[", "]")

  if (!label) {
    return null
  }

  let cursor = label.endIndex

  while (/\s/.test(text[cursor] ?? "")) {
    cursor += 1
  }

  const destination = readBalancedSegment(text, cursor, "(", ")")

  if (!destination) {
    return null
  }

  const href = normalizeLinkTarget(destination.value)

  if (!href) {
    return null
  }

  return {
    label: label.value,
    href,
    endIndex: destination.endIndex,
  }
}

function readAngleAutolink(text: string, startIndex: number) {
  if (text[startIndex] !== "<") {
    return null
  }

  const endIndex = text.indexOf(">", startIndex + 1)

  if (endIndex === -1) {
    return null
  }

  const href = text.slice(startIndex + 1, endIndex).trim()

  if (!/^(https?:\/\/|mailto:)/i.test(href)) {
    return null
  }

  return {
    href,
    endIndex: endIndex + 1,
  }
}

function parseInlineMarkdown(text: string) {
  if (!text) {
    return []
  }

  const nodes: JSONContent[] = []
  let buffer = ""
  let index = 0

  function flushBuffer() {
    appendPlainText(nodes, buffer)
    buffer = ""
  }

  while (index < text.length) {
    const char = text[index] ?? ""
    const strongMarker = text.startsWith("**", index) ? "**" : text.startsWith("__", index) ? "__" : null

    if (char === "\\" && index + 1 < text.length) {
      buffer += text[index + 1] ?? ""
      index += 2
      continue
    }

    const codeEnd = char === "`" ? findClosingToken(text, "`", index + 1) : -1

    if (char === "`" && codeEnd !== -1) {
      flushBuffer()
      nodes.push(createTextNode(text.slice(index + 1, codeEnd), [{ type: "code" }]))
      index = codeEnd + 1
      continue
    }

    const autolink = readAngleAutolink(text, index)

    if (autolink) {
      flushBuffer()
      nodes.push(
        createTextNode(autolink.href, [
          {
            type: "link",
            attrs: {
              href: autolink.href,
            },
          },
        ]),
      )
      index = autolink.endIndex
      continue
    }

    const markdownLink = readMarkdownLink(text, index)

    if (markdownLink) {
      flushBuffer()
      const noteId = parseNoteLinkHref(markdownLink.href)

      if (noteId) {
        nodes.push(createNoteLinkNode(noteId, markdownLink.label))
      } else {
        nodes.push(
          ...applyMark(parseInlineMarkdown(markdownLink.label), {
            type: "link",
            attrs: {
              href: markdownLink.href,
            },
          }),
        )
      }

      index = markdownLink.endIndex
      continue
    }

    if (strongMarker) {
      const strongEnd = findClosingToken(text, strongMarker, index + strongMarker.length)

      if (strongEnd !== -1) {
        flushBuffer()
        nodes.push(...applyMark(parseInlineMarkdown(text.slice(index + strongMarker.length, strongEnd)), { type: "bold" }))
        index = strongEnd + strongMarker.length
        continue
      }
    }

    if (char === "*" || char === "_") {
      const emphasisEnd = findClosingToken(text, char, index + 1)

      if (emphasisEnd !== -1) {
        flushBuffer()
        nodes.push(...applyMark(parseInlineMarkdown(text.slice(index + 1, emphasisEnd)), { type: "italic" }))
        index = emphasisEnd + 1
        continue
      }
    }

    buffer += char
    index += 1
  }

  flushBuffer()

  return nodes
}

function paragraphNode(text: string): JSONContent {
  const content = parseInlineMarkdown(text)

  return {
    type: "paragraph",
    ...(content.length ? { content } : {}),
  }
}

function listNode(type: "bulletList" | "orderedList", items: string[]): JSONContent {
  return {
    type,
    content: items.map((item) => ({
      type: "listItem",
      content: [paragraphNode(item)],
    })),
  }
}

function codeBlockNode(text: string, language: string | null): JSONContent {
  return {
    type: "codeBlock",
    ...(language ? { attrs: { language } } : {}),
    ...(text ? { content: [{ type: "text", text }] } : {}),
  }
}

function readCodeFenceStart(line: string) {
  const trimmed = line.trim()
  const match = trimmed.match(/^(`{3,}|~{3,})(.*)$/)

  if (!match) {
    return null
  }

  const fence = match[1] ?? ""
  const info = (match[2] ?? "").trim()
  const [language] = info.split(/\s+/, 1)

  return {
    marker: fence[0] ?? "`",
    length: fence.length,
    language: language?.trim() || null,
  }
}

function isCodeFenceClosingLine(line: string, marker: string, minimumLength: number) {
  const trimmed = line.trim()
  const match = trimmed.match(/^(`{3,}|~{3,})\s*$/)

  return Boolean(match && (match[1]?.[0] ?? "") === marker && (match[1]?.length ?? 0) >= minimumLength)
}

function fencedCodeBlock(lines: string[], startIndex: number) {
  const opening = readCodeFenceStart(lines[startIndex] ?? "")

  if (!opening) {
    return null
  }

  const codeLines: string[] = []
  let index = startIndex + 1

  while (index < lines.length) {
    const currentLine = lines[index] ?? ""

    if (isCodeFenceClosingLine(currentLine, opening.marker, opening.length)) {
      index += 1
      break
    }

    codeLines.push(currentLine)
    index += 1
  }

  return {
    content: codeBlockNode(codeLines.join("\n"), opening.language),
    nextIndex: index,
  }
}

function tableCellNode(type: "tableCell" | "tableHeader", text: string): JSONContent {
  return {
    type,
    content: [paragraphNode(text)],
  }
}

function splitTableCells(line: string) {
  const normalized = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  const cells: string[] = []
  let current = ""
  let escaped = false

  for (const char of normalized) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === "\\") {
      escaped = true
      continue
    }

    if (char === "|") {
      cells.push(current.trim())
      current = ""
      continue
    }

    current += char
  }

  if (escaped) {
    current += "\\"
  }

  cells.push(current.trim())

  return cells
}

function isTableSeparatorLine(line: string) {
  const trimmed = line.trim()

  if (!trimmed || !trimmed.includes("|")) {
    return false
  }

  const cells = splitTableCells(trimmed)

  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.replace(/\s+/g, "")))
}

function isTableBlockStart(lines: string[], startIndex: number) {
  const header = lines[startIndex]?.trim() ?? ""
  const separator = lines[startIndex + 1]?.trim() ?? ""

  if (!header.includes("|") || !separator.includes("|")) {
    return false
  }

  const headerCells = splitTableCells(header)
  const separatorCells = splitTableCells(separator)

  return headerCells.length > 0 && headerCells.length === separatorCells.length && isTableSeparatorLine(separator)
}

function normalizeTableRow(cells: string[], columnCount: number) {
  return Array.from({ length: columnCount }, (_, index) => cells[index]?.trim() ?? "")
}

function tableNode(lines: string[], startIndex: number) {
  const headerCells = splitTableCells(lines[startIndex] ?? "")
  const columnCount = headerCells.length
  const rows: JSONContent[] = [
    {
      type: "tableRow",
      content: normalizeTableRow(headerCells, columnCount).map((cell) => tableCellNode("tableHeader", cell)),
    },
  ]
  let index = startIndex + 2

  while (index < lines.length) {
    const candidate = lines[index]?.trim() ?? ""

    if (!candidate || !candidate.includes("|")) {
      break
    }

    rows.push({
      type: "tableRow",
      content: normalizeTableRow(splitTableCells(candidate), columnCount).map((cell) => tableCellNode("tableCell", cell)),
    })
    index += 1
  }

  return {
    content: {
      type: "table",
      content: rows,
    } satisfies JSONContent,
    nextIndex: index,
  }
}

function readParagraph(lines: string[], startIndex: number) {
  const parts: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const line = lines[index]?.trimEnd() ?? ""
    const trimmed = line.trim()

    if (!trimmed) {
      break
    }

    if (readCodeFenceStart(line)) {
      break
    }

    if (isTableBlockStart(lines, index)) {
      break
    }

    if (/^(#{1,3}\s+|>\s+|[-*]\s+|\d+\.\s+)/.test(trimmed)) {
      break
    }

    parts.push(trimmed)
    index += 1
  }

  return {
    content: paragraphNode(parts.join(" ")),
    nextIndex: index,
  }
}

function plainTextFromNode(node: JSONContent): string {
  if (node.type === "text") {
    return node.text ?? ""
  }

  if (node.type === "noteLink") {
    return typeof node.attrs?.title === "string" ? node.attrs.title : ""
  }

  if (node.type === "tableRow") {
    return (node.content ?? []).map((child) => plainTextFromNode(child)).join(" ")
  }

  if (node.type === "table") {
    return (node.content ?? []).map((child) => plainTextFromNode(child)).join("\n")
  }

  if (node.type === "codeBlock") {
    return (node.content ?? []).map((child) => plainTextFromNode(child)).join("\n")
  }

  if (node.content?.length) {
    const separator = node.type === "paragraph" || node.type === "heading" ? "" : " "

    return node.content.map((child) => plainTextFromNode(child)).join(separator)
  }

  return ""
}

export function documentFromMarkdown(source: string, fallbackTitle: string): CreateNoteInput {
  const normalized = source.replace(/\r\n/g, "\n").trim()
  const lines = normalized ? normalized.split("\n") : []
  const content: JSONContent[] = []
  let extractedTitle = fallbackTitle
  let titleResolved = false
  let index = 0

  while (index < lines.length) {
    const rawLine = lines[index] ?? ""
    const line = rawLine.trimEnd()
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    const codeBlock = fencedCodeBlock(lines, index)

    if (codeBlock) {
      content.push(codeBlock.content)
      index = codeBlock.nextIndex
      continue
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      const [, hashes, text] = trimmed.match(/^(#{1,3})\s+(.+)$/) ?? []
      const level = hashes?.length ?? 1
      const headingText = text?.trim() ?? trimmed.replace(/^#{1,3}\s+/, "")

      if (!titleResolved && level === 1 && headingText) {
        extractedTitle = headingText
        titleResolved = true
        index += 1
        continue
      }

      content.push({
        type: "heading",
        attrs: {
          level,
        },
        content: parseInlineMarkdown(headingText),
      })
      index += 1
      continue
    }

    if (/^>\s+/.test(trimmed)) {
      const quoteLines: string[] = []

      while (index < lines.length) {
        const candidate = lines[index]?.trim() ?? ""

        if (!candidate.startsWith("> ")) {
          break
        }

        quoteLines.push(candidate.replace(/^>\s+/, ""))
        index += 1
      }

      content.push({
        type: "blockquote",
        content: [paragraphNode(quoteLines.join(" "))],
      })
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []

      while (index < lines.length) {
        const candidate = lines[index]?.trim() ?? ""

        if (!/^[-*]\s+/.test(candidate)) {
          break
        }

        items.push(candidate.replace(/^[-*]\s+/, ""))
        index += 1
      }

      content.push(listNode("bulletList", items))
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []

      while (index < lines.length) {
        const candidate = lines[index]?.trim() ?? ""

        if (!/^\d+\.\s+/.test(candidate)) {
          break
        }

        items.push(candidate.replace(/^\d+\.\s+/, ""))
        index += 1
      }

      content.push(listNode("orderedList", items))
      continue
    }

    if (isTableBlockStart(lines, index)) {
      const table = tableNode(lines, index)
      content.push(table.content)
      index = table.nextIndex
      continue
    }

    const paragraph = readParagraph(lines, index)
    content.push(paragraph.content)
    index = paragraph.nextIndex
  }

  const plainText = content
    .map((node) => plainTextFromNode(node))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim()

  return {
    title: extractedTitle,
    plainText,
    content: {
      type: "doc",
      content: content.length > 0 ? content : [paragraphNode("")],
    },
  }
}

function renderText(node: JSONContent) {
  const baseText = node.text ?? ""
  const marks = node.marks ?? []
  const hasCode = marks.some((mark) => mark.type === "code")
  const hasBold = marks.some((mark) => mark.type === "bold")
  const hasItalic = marks.some((mark) => mark.type === "italic")
  const linkMark = marks.find((mark) => mark.type === "link")
  let value = baseText

  if (hasCode) {
    value = `\`${value}\``
  }

  if (hasBold) {
    value = `**${value}**`
  }

  if (hasItalic) {
    value = `_${value}_`
  }

  if (typeof linkMark?.attrs?.href === "string" && linkMark.attrs.href) {
    value = `[${value}](${linkMark.attrs.href})`
  }

  return value
}

function renderInline(content?: JSONContent[]) {
  return (content ?? []).map((node) => renderNode(node, 0)).join("")
}

function renderList(content: JSONContent[] | undefined, depth: number, ordered: boolean) {
  return (content ?? [])
    .map((item, index) => {
      const prefix = `${"  ".repeat(depth)}${ordered ? `${index + 1}.` : "-"} `
      const firstParagraph = item.content?.find((child) => child.type === "paragraph")
      const value = firstParagraph ? renderInline(firstParagraph.content) : ""

      return `${prefix}${value}`
    })
    .join("\n")
}

function renderTableCell(node: JSONContent) {
  return (node.content ?? [])
    .map((child) => {
      if (child.type === "paragraph") {
        return renderInline(child.content)
      }

      return renderNode(child, 0)
    })
    .join("<br>")
    .replace(/\|/g, "\\|")
}

function renderTable(node: JSONContent) {
  const rows = node.content ?? []

  if (rows.length === 0) {
    return ""
  }

  const [headerRow, ...bodyRows] = rows
  const headerCells = (headerRow?.content ?? []).map((cell) => renderTableCell(cell))

  if (headerCells.length === 0) {
    return ""
  }

  const separator = Array.from({ length: headerCells.length }, () => "---")
  const markdownRows = [
    `| ${headerCells.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...bodyRows.map((row) => `| ${(row.content ?? []).map((cell) => renderTableCell(cell)).join(" | ")} |`),
  ]

  return markdownRows.join("\n")
}

function renderNode(node: JSONContent, depth: number): string {
  if (node.type === "text") {
    return renderText(node)
  }

  if (node.type === "noteLink") {
    const noteId = typeof node.attrs?.noteId === "string" ? node.attrs.noteId : ""
    const title = typeof node.attrs?.title === "string" && node.attrs.title.trim() ? node.attrs.title.trim() : "Untitled note"

    return noteId ? `[${title}](${buildNoteLinkHref(noteId)})` : title
  }

  if (node.type === "heading") {
    const level = Math.max(1, Math.min(3, Number(node.attrs?.level ?? 1)))

    return `${"#".repeat(level)} ${renderInline(node.content)}`
  }

  if (node.type === "paragraph") {
    return renderInline(node.content)
  }

  if (node.type === "bulletList") {
    return renderList(node.content, depth, false)
  }

  if (node.type === "orderedList") {
    return renderList(node.content, depth, true)
  }

  if (node.type === "blockquote") {
    return (node.content ?? [])
      .map((child) => `> ${renderNode(child, depth)}`)
      .join("\n")
  }

  if (node.type === "codeBlock") {
    const body = node.content?.map((child) => child.text ?? "").join("") ?? ""
    const language = typeof node.attrs?.language === "string" && node.attrs.language ? node.attrs.language : ""

    return `\`\`\`${language}\n${body}\n\`\`\``
  }

  if (node.type === "table") {
    return renderTable(node)
  }

  if (node.content?.length) {
    return node.content.map((child) => renderNode(child, depth)).join("")
  }

  return ""
}

function sanitizeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").slice(0, 80) || "metis-note"
}

export function noteToMarkdown(note: NoteDocument) {
  const blocks = note.content.content ?? []
  const renderedBody = blocks.map((block) => renderNode(block, 0)).filter(Boolean).join("\n\n")
  const metaLines = [
    note.tags.length > 0 ? `> Tags: ${note.tags.join(", ")}` : "",
    `> Updated: ${new Date(note.updatedAt).toLocaleString("zh-CN")}`,
  ].filter(Boolean)

  return [`# ${note.title}`, ...metaLines, "", renderedBody].join("\n").trim() + "\n"
}

export function defaultExportPath(title: string) {
  return `${sanitizeFileName(title)}.md`
}

export function fallbackTitleFromPath(filePath: string) {
  return path.basename(filePath, path.extname(filePath))
}
