import { DragHandle as TiptapDragHandle } from "@tiptap/extension-drag-handle-react"
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { JSONContent } from "@tiptap/core"
import { Fragment as ProseMirrorFragment, Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state"
import { TableMap } from "@tiptap/pm/tables"
import Details from "@tiptap/extension-details"
import DetailsContent from "@tiptap/extension-details-content"
import DetailsSummary from "@tiptap/extension-details-summary"
import { ManagedCodeBlock } from "./editor/code-block-node"
import Highlight from "@tiptap/extension-highlight"
import Link from "@tiptap/extension-link"
import Mathematics from "@tiptap/extension-mathematics"
import Placeholder from "@tiptap/extension-placeholder"
import Subscript from "@tiptap/extension-subscript"
import Superscript from "@tiptap/extension-superscript"
import Table from "@tiptap/extension-table"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import TaskItem from "@tiptap/extension-task-item"
import TaskList from "@tiptap/extension-task-list"
import TextAlign from "@tiptap/extension-text-align"
import TableRow from "@tiptap/extension-table-row"
import Typography from "@tiptap/extension-typography"
import Underline from "@tiptap/extension-underline"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Clock3,
  ChevronRight,
  Code2,
  Download,
  FileText,
  GripVertical,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  ListChecks,
  List,
  ListOrdered,
  ListTree,
  Link2,
  Maximize2,
  Minus,
  Minimize2,
  MoreHorizontal,
  Paperclip,
  PanelTop,
  Printer,
  Quote,
  Sigma,
  Sparkles,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  TableCellsMerge,
  TableColumnsSplit,
  TableRowsSplit,
  Trash2,
  Type,
  Underline as UnderlineIcon,
} from "lucide-react"
import { common, createLowlight } from "lowlight"
import { AiWritePanel, type AiWritePanelPosition, type AiWritePanelStatus } from "@/components/editor/ai-write-panel"
import {
  buildAiWriteInsertContent,
  buildAiWriteUserPromptWithInstruction,
  collectAiWriteContext,
  getAiWriteSystemPrompt,
  type AiWriteContext,
} from "@/components/editor/ai-write"
import { FileAttachment } from "@/components/editor/file-attachment"
import { ImageLightbox } from "@/components/editor/image-lightbox"
import { ManagedImage } from "@/components/editor/managed-image"
import { MathBlock } from "@/components/editor/math-block"
import { NoteLink, NoteLinkRenderStore } from "@/components/editor/note-link"
import { NoteLinkPicker, type NoteLinkPickerItem } from "@/components/editor/note-link-picker"
import { getNoteLinkTriggerMatch, getSlashCommandMatch, matchesSlashCommandQuery } from "@/components/editor/slash-command"
import { TocPanel, type TocItem } from "@/components/editor/toc-panel"
import { VersionHistoryPanel, type VersionHistoryListItem } from "@/components/editor/version-history-panel"
import { NoteBacklinks } from "@/components/note-backlinks"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/provider"
import { cn } from "@/lib/utils"
import {
  getFileExtension,
  isImageExtension,
  stripFileExtension,
  type FileAssetResult,
  type ImageAssetResult,
} from "@/shared/assets"
import type { LlmStreamChatParams } from "@/shared/llm"
import {
  buildNotePathTitles,
  createEmptyDocument,
  createNoteLinkNode,
  extractNoteLinkIds,
  type NoteDocument,
  type NoteLinkResolutionMap,
  type NoteSummary,
} from "@/shared/notes"
import type { VersionSummary } from "@/shared/versions"
import type { AppLocale, AppMessages } from "@/shared/i18n"

interface NoteEditorProps {
  note: NoteDocument | null
  allNotes: NoteSummary[]
  requestedMode: "preview" | "edit"
  modeRequestId: number
  isLoading: boolean
  isSaving: boolean
  lastSavedAt: string | null
  errorMessage: string | null
  onTitleChange: (title: string) => void
  onContentChange: (content: JSONContent, plainText: string) => void
  onMoveToTrash: () => void
  onDeleteForever: () => void
  onExportNote: () => void
  onExportPdf: () => Promise<void> | void
  onPrintNote: () => Promise<void> | void
  onSaveAsTemplate: () => Promise<void> | void
  onCommitEdits: () => Promise<void> | void
  onRestoreVersion: (timestamp: string) => Promise<void> | void
  onOpenLinkedNote: (noteId: string) => void
  isFocusMode: boolean
  onToggleFocusMode: () => void
}

interface SlashCommandState {
  query: string
  range: {
    from: number
    to: number
  }
  position: AiWritePanelPosition
  selectedIndex: number
}

interface SlashCommandItem {
  id:
    | "ai-write"
    | "note-link"
    | "heading-1"
    | "heading-2"
    | "heading-3"
    | "task-list"
    | "table"
    | "image"
    | "file"
    | "details"
    | "math"
    | "toc"
    | "code-block"
    | "blockquote"
    | "horizontal-rule"
  group: string
  label: string
  description: string
  disabled: boolean
  hint: string | null
  keywords: string[]
  icon:
    | "sparkles"
    | "link"
    | "heading"
    | "task-list"
    | "table"
    | "image"
    | "file"
    | "details"
    | "math"
    | "toc"
    | "code-block"
    | "blockquote"
    | "horizontal-rule"
}

interface AiWriteState {
  requestId: string
  streamId: string | null
  insertPosition: number
  position: AiWritePanelPosition
  status: AiWritePanelStatus
  context: AiWriteContext
  userInstruction: string
  generatedText: string
  errorMessage: string | null
  request: LlmStreamChatParams | null
}

interface NoteLinkPickerState {
  replaceRange: {
    from: number
    to: number
  }
  position: AiWritePanelPosition
  query: string
  selectedIndex: number
}

interface LightboxImageState {
  src: string
  alt: string | null
}

interface TableInsertPickerState {
  source: "toolbar" | "slash"
  insertPosition: number
  position: AiWritePanelPosition | null
  rows: number
  cols: number
}

type EditorAssetFile = File & { path?: string }

const TABLE_PICKER_MAX_ROWS = 6
const TABLE_PICKER_MAX_COLS = 6
const TABLE_INDEX_SYNC_META = "metis-note-table-index-sync"
const tableIndexSyncPluginKey = new PluginKey("metis-note-table-index-sync")

function hasTableHeaderRow(tableNode: ProseMirrorNode) {
  const firstRow = tableNode.firstChild

  if (!firstRow || firstRow.type.name !== "tableRow" || firstRow.childCount === 0) {
    return false
  }

  for (let index = 0; index < firstRow.childCount; index += 1) {
    if (firstRow.child(index).type.name !== "tableHeader") {
      return false
    }
  }

  return true
}

function buildTableIndexCellContent(tableNode: ProseMirrorNode, label: string) {
  const paragraphNode = tableNode.type.schema.nodes.paragraph

  if (!paragraphNode) {
    return null
  }

  return ProseMirrorFragment.from(paragraphNode.create(null, tableNode.type.schema.text(label)))
}

function syncIndexedTableAtPosition(tr: Transaction, tablePosition: number) {
  const tableNode = tr.doc.nodeAt(tablePosition)

  if (!tableNode || tableNode.type.name !== "table" || !tableNode.attrs.indexColumn) {
    return false
  }

  const nextCellContent = buildTableIndexCellContent(tableNode, "1")

  if (!nextCellContent) {
    return false
  }

  const tableMap = TableMap.get(tableNode)
  const numberingStartRow = hasTableHeaderRow(tableNode) ? 1 : 0
  const seenCellOffsets = new Set<number>()
  let didChange = false
  let sequence = 1

  for (let rowIndex = numberingStartRow; rowIndex < tableMap.height; rowIndex += 1) {
    const cellOffset = tableMap.positionAt(rowIndex, 0, tableNode)

    if (cellOffset === undefined || seenCellOffsets.has(cellOffset)) {
      continue
    }

    seenCellOffsets.add(cellOffset)

    const cellPosition = tr.mapping.map(tablePosition + 1 + cellOffset)
    const cellNode = tr.doc.nodeAt(cellPosition)

    if (!cellNode || !["tableCell", "tableHeader"].includes(cellNode.type.name)) {
      continue
    }

    const expectedContent = sequence === 1 ? nextCellContent : buildTableIndexCellContent(tableNode, String(sequence))

    if (!expectedContent || cellNode.content.eq(expectedContent)) {
      sequence += 1
      continue
    }

    tr.replaceWith(cellPosition + 1, cellPosition + cellNode.nodeSize - 1, expectedContent)
    didChange = true
    sequence += 1
  }

  return didChange
}

function syncIndexedTablesInTransaction(tr: Transaction) {
  const indexedTablePositions: number[] = []

  tr.doc.descendants((node, position) => {
    if (node.type.name === "table" && node.attrs.indexColumn) {
      indexedTablePositions.push(position)
    }

    return undefined
  })

  let didChange = false

  for (const tablePosition of indexedTablePositions) {
    const mappedTablePosition = tr.mapping.map(tablePosition)

    if (syncIndexedTableAtPosition(tr, mappedTablePosition)) {
      didChange = true
    }
  }

  return didChange
}

function findSelectedTable(state: EditorState) {
  const { $from } = state.selection

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)

    if (node.type.name === "table") {
      return {
        node,
        pos: $from.before(depth),
      }
    }
  }

  return null
}

const ManagedTable = Table.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      indexColumn: {
        default: false,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-index-column") === "true",
        renderHTML: (attributes: { indexColumn?: boolean }) =>
          attributes.indexColumn ? { "data-index-column": "true" } : {},
      },
    }
  },
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: tableIndexSyncPluginKey,
        appendTransaction(transactions, _oldState, newState) {
          if (
            transactions.some((transaction) => transaction.getMeta(TABLE_INDEX_SYNC_META)) ||
            !transactions.some((transaction) => transaction.docChanged)
          ) {
            return null
          }

          const nextTransaction = newState.tr

          if (!syncIndexedTablesInTransaction(nextTransaction)) {
            return null
          }

          nextTransaction.setMeta(TABLE_INDEX_SYNC_META, true)

          return nextTransaction
        },
      }),
    ]
  },
})

function formatHeaderDate(locale: AppLocale, value: string | null, unsavedLabel: string) {
  if (!value) {
    return unsavedLabel
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

function formatStatusLabel(
  locale: AppLocale,
  unsavedLabel: string,
  savingLabel: string,
  isSaving: boolean,
  errorMessage: string | null,
  lastSavedAt: string | null,
) {
  if (errorMessage) {
    return errorMessage
  }

  if (isSaving) {
    return savingLabel
  }

  return formatHeaderDate(locale, lastSavedAt, unsavedLabel)
}

function formatVersionTimestamp(locale: AppLocale, value: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

function clampOverlayPosition(value: number, width: number, overlayWidth: number) {
  const maxLeft = Math.max(12, width - overlayWidth - 12)

  return Math.min(Math.max(12, value), maxLeft)
}

interface ToolbarButtonProps {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  title?: string
  tone?: "default" | "danger"
  children: ReactNode
}

const lowlight = createLowlight(common)

const MATH_EXPRESSION_REGEX = /\$\$([^$]+)\$\$|\$([^$\n]+)\$/g

const ManagedSubscript = Subscript.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-Shift-,": () => this.editor.commands.toggleSubscript(),
    }
  },
})

const ManagedSuperscript = Superscript.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-Shift-.": () => this.editor.commands.toggleSuperscript(),
    }
  },
})

const HIGHLIGHT_COLORS = [
  { value: "#fef08a", swatchClassName: "bg-[#fef08a]" },
  { value: "#bbf7d0", swatchClassName: "bg-[#bbf7d0]" },
  { value: "#bfdbfe", swatchClassName: "bg-[#bfdbfe]" },
  { value: "#fbcfe8", swatchClassName: "bg-[#fbcfe8]" },
  { value: "#fed7aa", swatchClassName: "bg-[#fed7aa]" },
] as const

function ToolbarButton({ active, disabled, onClick, title, tone = "default", children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[#7f8794] transition hover:text-foreground dark:text-slate-400",
        tone === "danger"
          ? active
            ? "bg-[rgba(180,35,24,0.08)] text-[#b42318] dark:bg-[#261318] dark:text-[#fda29b]"
            : "text-[#b42318] hover:bg-[rgba(180,35,24,0.05)] hover:text-[#b42318] dark:text-[#fda29b] dark:hover:bg-[#261318] dark:hover:text-[#fda29b]"
          : active
            ? "bg-[#eef4ff] text-[#2563eb] dark:bg-[#13233f] dark:text-[#8eb8ff]"
            : "hover:bg-[#f8fafc] dark:hover:bg-[#0f172a]",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <span className="mx-1 hidden h-4 w-px bg-[#e7ebf1] dark:bg-[#243041] md:inline-flex" />
}

function SlashCommandIcon({ icon }: { icon: SlashCommandItem["icon"] }) {
  switch (icon) {
    case "sparkles":
      return <Sparkles className="h-4 w-4" />
    case "link":
      return <Link2 className="h-4 w-4" />
    case "task-list":
      return <ListChecks className="h-4 w-4" />
    case "table":
      return <FileText className="h-4 w-4" />
    case "image":
      return <ImagePlus className="h-4 w-4" />
    case "file":
      return <Paperclip className="h-4 w-4" />
    case "details":
      return <ChevronRight className="h-4 w-4" />
    case "math":
      return <Sigma className="h-4 w-4" />
    case "toc":
      return <ListTree className="h-4 w-4" />
    case "code-block":
      return <Code2 className="h-4 w-4" />
    case "blockquote":
      return <Quote className="h-4 w-4" />
    case "horizontal-rule":
      return <Minus className="h-4 w-4" />
    default:
      return <Heading3 className="h-4 w-4" />
  }
}

function getSlashCommandIconClassName(icon: SlashCommandItem["icon"]) {
  switch (icon) {
    case "sparkles":
      return "border-[#ede9fe] bg-[#f5f3ff] text-[#7c3aed]"
    case "link":
      return "border-[#dbe4ff] bg-[#eef4ff] text-[#375bd2]"
    case "task-list":
      return "border-[#dcfce7] bg-[#f0fdf4] text-[#15803d]"
    case "table":
      return "border-[#e5e7eb] bg-[#f8fafc] text-[#475467]"
    case "image":
      return "border-[#dcfce7] bg-[#f0fdf4] text-[#15803d]"
    case "file":
      return "border-[#ffedd5] bg-[#fff7ed] text-[#c2410c]"
    case "details":
      return "border-[#e0e7ff] bg-[#eef2ff] text-[#4338ca]"
    case "math":
      return "border-[#fae8ff] bg-[#fdf4ff] text-[#a21caf]"
    case "toc":
      return "border-[#d1fae5] bg-[#ecfdf5] text-[#047857]"
    case "code-block":
      return "border-[#ffe4e6] bg-[#fff1f2] text-[#be123c]"
    case "blockquote":
      return "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]"
    case "horizontal-rule":
      return "border-[#e5e7eb] bg-[#f8fafc] text-[#667085]"
    default:
      return "border-[#e0e7ff] bg-[#eef2ff] text-[#4338ca]"
  }
}

function buildTocItems(editor: Editor | null): TocItem[] {
  if (!editor) {
    return []
  }

  const items: TocItem[] = []

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") {
      return undefined
    }

    items.push({
      level: Math.max(1, Math.min(3, Number(node.attrs.level ?? 1))),
      pos,
      text: node.textContent.trim(),
    })

    return undefined
  })

  return items.filter((item) => item.text)
}

function MenuItemButton({
  className,
  onClick,
  children,
}: {
  className?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-[#f8fafc] dark:text-slate-200 dark:hover:bg-[#0f172a]",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function MetaPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-[#e7ebf1] bg-[#fbfcfe] px-3 py-1.5 text-[13px] font-medium text-[#667085] dark:border-[#243041] dark:bg-[#111827] dark:text-slate-300">
      {children}
    </span>
  )
}

function TableInsertPicker({
  messages,
  rows,
  cols,
  onSelectSize,
  onHoverSize,
  onClose,
}: {
  messages: AppMessages["editor"]["tablePicker"]
  rows: number
  cols: number
  onSelectSize: (rows: number, cols: number) => void
  onHoverSize: (rows: number, cols: number) => void
  onClose: () => void
}) {
  return (
    <div className="w-[272px] rounded-2xl border border-[#e7ebf1] bg-white p-3 shadow-[0_18px_44px_rgba(15,23,42,0.12)] dark:border-[#243041] dark:bg-[#111827]">
      <div className="px-1">
        <div className="text-sm font-semibold text-[#1f3045] dark:text-slate-100">{messages.title}</div>
        <div className="mt-1 text-xs leading-5 text-[#667085] dark:text-slate-400">{messages.description}</div>
      </div>

      <div className="mt-3 grid grid-cols-6 gap-1">
        {Array.from({ length: TABLE_PICKER_MAX_ROWS }).map((_, rowIndex) =>
          Array.from({ length: TABLE_PICKER_MAX_COLS }).map((__, colIndex) => {
            const nextRows = rowIndex + 1
            const nextCols = colIndex + 1
            const active = nextRows <= rows && nextCols <= cols

            return (
              <button
                key={`${nextRows}-${nextCols}`}
                type="button"
                className={cn(
                  "h-7 rounded-md border transition",
                  active
                    ? "border-[#8eb6e8] bg-[#e8f2ff]"
                    : "border-[#dbe4f0] bg-[#f8fbff] hover:border-[#bfd3f8] hover:bg-[#edf4ff]",
                  "dark:border-[#334155] dark:bg-[#0f172a] dark:hover:border-[#4f6b95] dark:hover:bg-[#13233f]",
                )}
                onMouseEnter={() => onHoverSize(nextRows, nextCols)}
                onFocus={() => onHoverSize(nextRows, nextCols)}
                onClick={() => onSelectSize(nextRows, nextCols)}
              />
            )
          }),
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 px-1">
        <div className="text-xs font-medium text-[#667085] dark:text-slate-400">{messages.selectedSize(rows, cols)}</div>
        <Button className="h-8 rounded-md px-3 text-xs" size="sm" variant="outline" onClick={onClose}>
          {messages.cancel}
        </Button>
      </div>
    </div>
  )
}

export function NoteEditor({
  note,
  allNotes,
  requestedMode,
  modeRequestId,
  isLoading,
  isSaving,
  lastSavedAt,
  errorMessage,
  onTitleChange,
  onContentChange,
  onMoveToTrash,
  onDeleteForever,
  onExportNote,
  onExportPdf,
  onPrintNote,
  onSaveAsTemplate,
  onCommitEdits,
  onRestoreVersion,
  onOpenLinkedNote,
  isFocusMode,
  onToggleFocusMode,
}: NoteEditorProps) {
  const { locale, messages } = useI18n()
  const [isEditing, setIsEditing] = useState(false)
  const [isTitleEditing, setIsTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(note?.title ?? "")
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const [isFormatMenuOpen, setIsFormatMenuOpen] = useState(false)
  const [isHighlightMenuOpen, setIsHighlightMenuOpen] = useState(false)
  const [activeTableMenu, setActiveTableMenu] = useState<"column" | "row" | "cell" | "header" | "danger" | null>(null)
  const [isTocOpen, setIsTocOpen] = useState(false)
  const [isVersionPanelOpen, setIsVersionPanelOpen] = useState(false)
  const [isLoadingVersions, setIsLoadingVersions] = useState(false)
  const [isRestoringVersion, setIsRestoringVersion] = useState(false)
  const [visibleTocPos, setVisibleTocPos] = useState<number | null>(null)
  const [versionSummaries, setVersionSummaries] = useState<VersionSummary[]>([])
  const [selectedVersionTimestamp, setSelectedVersionTimestamp] = useState<string | null>(null)
  const [selectedVersionContent, setSelectedVersionContent] = useState<JSONContent | null>(null)
  const [hasEnabledModel, setHasEnabledModel] = useState(false)
  const [slashCommand, setSlashCommand] = useState<SlashCommandState | null>(null)
  const [aiWriteState, setAiWriteState] = useState<AiWriteState | null>(null)
  const [noteLinkPicker, setNoteLinkPicker] = useState<NoteLinkPickerState | null>(null)
  const [lightboxImage, setLightboxImage] = useState<LightboxImageState | null>(null)
  const [tableInsertPicker, setTableInsertPicker] = useState<TableInsertPickerState | null>(null)
  const [backlinks, setBacklinks] = useState<NoteSummary[]>([])
  const menuRef = useRef<HTMLDivElement>(null)
  const formatMenuRef = useRef<HTMLDivElement>(null)
  const highlightMenuRef = useRef<HTMLDivElement>(null)
  const tableMenuRef = useRef<HTMLDivElement>(null)
  const slashMenuRef = useRef<HTMLDivElement>(null)
  const noteLinkPickerRef = useRef<HTMLDivElement>(null)
  const tableInsertPickerRef = useRef<HTMLDivElement>(null)
  const tableToolbarPickerRef = useRef<HTMLDivElement>(null)
  const editorSurfaceRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const tocOpenRef = useRef(false)
  const isVersionPreviewingRef = useRef(false)
  const syncingEditorContentRef = useRef(false)
  const slashCommandRef = useRef<SlashCommandState | null>(null)
  const aiWriteStateRef = useRef<AiWriteState | null>(null)
  const noteLinkPickerStateRef = useRef<NoteLinkPickerState | null>(null)
  const tableInsertPickerStateRef = useRef<TableInsertPickerState | null>(null)
  const slashCommandsRef = useRef<SlashCommandItem[]>([])
  const currentNoteLinkIdsRef = useRef<string[]>([])
  const noteLinkResolutionRequestRef = useRef(0)
  const noteLinkRenderStoreRef = useRef(new NoteLinkRenderStore())
  const notePathLabelsRef = useRef<Map<string, string | null>>(new Map())
  const openLinkedNoteRef = useRef(onOpenLinkedNote)
  const lastSyncedExternalContentRef = useRef<string | null>(null)
  const confirmAiWriteRef = useRef<() => void>(() => undefined)
  const cancelAiWriteRef = useRef<() => void>(() => undefined)
  const retryAiWriteRef = useRef<() => void>(() => undefined)
  const runSelectedSlashCommandRef = useRef<() => void>(() => undefined)
  const canEditNote = note?.status === "active"
  const isVersionPreviewing = selectedVersionTimestamp !== null && selectedVersionContent !== null
  const isToolbarDisabled = !note || !canEditNote || !isEditing || isVersionPreviewing
  const emptyDocument = useMemo(() => createEmptyDocument(), [])
  const displayedContent = selectedVersionContent ?? note?.content ?? emptyDocument
  const displayedContentSnapshot = useMemo(() => JSON.stringify(displayedContent), [displayedContent])
  const linkableNotes = useMemo(
    () => allNotes.filter((item) => item.status === "active" && item.id !== note?.id),
    [allNotes, note?.id],
  )
  const notePathLabels = useMemo(
    () =>
      new Map(
        allNotes.map((item) => {
          const titles = buildNotePathTitles(allNotes, item.id).slice(0, -1)

          return [item.id, titles.length > 0 ? titles.join(" / ") : null] as const
        }),
      ),
    [allNotes],
  )
  const noteLinkPickerItems = useMemo(() => {
    const normalizedQuery = noteLinkPicker?.query.trim().toLowerCase() ?? ""

    return linkableNotes
      .filter((item) => {
        if (!normalizedQuery) {
          return true
        }

        const pathLabel = notePathLabels.get(item.id) ?? ""

        return [item.title, pathLabel].join(" ").toLowerCase().includes(normalizedQuery)
      })
      .map(
        (item) =>
          ({
            id: item.id,
            title: item.title,
            pathLabel: notePathLabels.get(item.id) ?? null,
          }) satisfies NoteLinkPickerItem,
      )
  }, [linkableNotes, noteLinkPicker?.query, notePathLabels])
  const slashCommandItems = useMemo(
    () =>
      [
        {
          id: "ai-write",
          group: messages.editor.commandGroups.ai,
          label: messages.editor.aiWrite.slashLabel,
          description: messages.editor.aiWrite.slashDescription,
          disabled: !hasEnabledModel,
          hint: hasEnabledModel ? null : messages.editor.aiWrite.disabledHint,
          keywords: [messages.editor.aiWrite.slashLabel, "AI", "write", "帮写", "续写"],
          icon: "sparkles",
        },
        {
          id: "note-link",
          group: messages.editor.commandGroups.links,
          label: messages.editor.noteLinks.slashLabel,
          description: messages.editor.noteLinks.slashDescription,
          disabled: linkableNotes.length === 0,
          hint: linkableNotes.length === 0 ? messages.editor.noteLinks.disabledHint : null,
          keywords: [messages.editor.noteLinks.slashLabel, "link", "document", "wiki", "链接", "文档"],
          icon: "link",
        },
        {
          id: "heading-1",
          group: messages.editor.commandGroups.structure,
          label: messages.editor.commands.heading1,
          description: messages.editor.commandDescriptions.heading1,
          disabled: false,
          hint: null,
          keywords: [messages.editor.commands.heading1, "h1", "title", "标题"],
          icon: "heading",
        },
        {
          id: "heading-2",
          group: messages.editor.commandGroups.structure,
          label: messages.editor.commands.heading2,
          description: messages.editor.commandDescriptions.heading2,
          disabled: false,
          hint: null,
          keywords: [messages.editor.commands.heading2, "h2", "subtitle", "二级标题"],
          icon: "heading",
        },
        {
          id: "heading-3",
          group: messages.editor.commandGroups.structure,
          label: messages.editor.commands.heading3,
          description: messages.editor.commandDescriptions.heading3,
          disabled: false,
          hint: null,
          keywords: [messages.editor.commands.heading3, "h3", "section", "三级标题"],
          icon: "heading",
        },
        {
          id: "task-list",
          group: messages.editor.commandGroups.lists,
          label: messages.editor.commands.taskList,
          description: messages.editor.commandDescriptions.taskList,
          disabled: false,
          hint: null,
          keywords: [messages.editor.commands.taskList, "todo", "task", "checkbox", "待办"],
          icon: "task-list",
        },
        {
          id: "table",
          group: messages.editor.commandGroups.blocks,
          label: messages.editor.commands.table,
          description: messages.editor.commandDescriptions.table,
          disabled: false,
          hint: null,
          keywords: [messages.editor.commands.table, "grid", "sheet", "表格"],
          icon: "table",
        },
        {
          id: "details",
          group: messages.editor.commandGroups.blocks,
          label: messages.editor.commands.details,
          description: messages.editor.commandDescriptions.details,
          disabled: false,
          hint: null,
          keywords: [messages.editor.commands.details, "details", "fold", "折叠"],
          icon: "details",
        },
        {
          id: "math",
          group: messages.editor.commandGroups.blocks,
          label: messages.editor.commands.math,
          description: messages.editor.commandDescriptions.math,
          disabled: false,
          hint: null,
          keywords: [messages.editor.commands.math, "math", "latex", "公式"],
          icon: "math",
        },
        {
          id: "image",
          group: messages.editor.commandGroups.blocks,
          label: messages.editor.commands.image,
          description: messages.editor.commandDescriptions.image,
          disabled: false,
          hint: null,
          keywords: [messages.editor.commands.image, "image", "photo", "图片"],
          icon: "image",
        },
        {
          id: "file",
          group: messages.editor.commandGroups.blocks,
          label: messages.editor.commands.file,
          description: messages.editor.commandDescriptions.file,
          disabled: false,
          hint: null,
          keywords: [messages.editor.commands.file, "file", "attachment", "附件"],
          icon: "file",
        },
        {
          id: "toc",
          group: messages.editor.commandGroups.navigation,
          label: messages.editor.commands.toc,
          description: messages.editor.commandDescriptions.toc,
          disabled: false,
          hint: null,
          keywords: [messages.editor.commands.toc, "toc", "outline", "目录"],
          icon: "toc",
        },
        {
          id: "code-block",
          group: messages.editor.commandGroups.blocks,
          label: messages.editor.commands.codeBlock,
          description: messages.editor.commandDescriptions.codeBlock,
          disabled: false,
          hint: null,
          keywords: [messages.editor.commands.codeBlock, "code", "snippet", "代码"],
          icon: "code-block",
        },
        {
          id: "blockquote",
          group: messages.editor.commandGroups.blocks,
          label: messages.editor.commands.blockquote,
          description: messages.editor.commandDescriptions.blockquote,
          disabled: false,
          hint: null,
          keywords: [messages.editor.commands.blockquote, "quote", "引用"],
          icon: "blockquote",
        },
        {
          id: "horizontal-rule",
          group: messages.editor.commandGroups.blocks,
          label: messages.editor.commands.horizontalRule,
          description: messages.editor.commandDescriptions.horizontalRule,
          disabled: false,
          hint: null,
          keywords: [messages.editor.commands.horizontalRule, "divider", "separator", "分割线"],
          icon: "horizontal-rule",
        },
      ] satisfies SlashCommandItem[],
    [
      hasEnabledModel,
      linkableNotes.length,
      messages.editor.aiWrite.disabledHint,
      messages.editor.aiWrite.slashDescription,
      messages.editor.aiWrite.slashLabel,
      messages.editor.commandDescriptions.blockquote,
      messages.editor.commandDescriptions.codeBlock,
      messages.editor.commandDescriptions.details,
      messages.editor.commandDescriptions.file,
      messages.editor.commandDescriptions.heading1,
      messages.editor.commandDescriptions.heading2,
      messages.editor.commandDescriptions.heading3,
      messages.editor.commandDescriptions.horizontalRule,
      messages.editor.commandDescriptions.image,
      messages.editor.commandDescriptions.math,
      messages.editor.commandDescriptions.table,
      messages.editor.commandDescriptions.taskList,
      messages.editor.commandDescriptions.toc,
      messages.editor.commandGroups.ai,
      messages.editor.commandGroups.blocks,
      messages.editor.commandGroups.links,
      messages.editor.commandGroups.lists,
      messages.editor.commandGroups.navigation,
      messages.editor.commandGroups.structure,
      messages.editor.commands.blockquote,
      messages.editor.commands.codeBlock,
      messages.editor.commands.details,
      messages.editor.commands.file,
      messages.editor.commands.heading1,
      messages.editor.commands.heading2,
      messages.editor.commands.heading3,
      messages.editor.commands.horizontalRule,
      messages.editor.commands.image,
      messages.editor.commands.math,
      messages.editor.commands.table,
      messages.editor.commands.taskList,
      messages.editor.commands.toc,
      messages.editor.noteLinks.disabledHint,
      messages.editor.noteLinks.slashDescription,
      messages.editor.noteLinks.slashLabel,
    ],
  )

  function resolveOverlayPosition(position: number, overlayWidth: number) {
    if (!editor || !editorSurfaceRef.current) {
      return null
    }

    const clampedPosition = Math.max(1, Math.min(position, Math.max(1, editor.state.doc.content.size)))
    const coords = editor.view.coordsAtPos(clampedPosition)
    const surfaceRect = editorSurfaceRef.current.getBoundingClientRect()

    return {
      top: coords.bottom - surfaceRect.top + 8,
      left: clampOverlayPosition(coords.left - surfaceRect.left, surfaceRect.width, overlayWidth),
    } satisfies AiWritePanelPosition
  }

  async function refreshEnabledModelAvailability() {
    try {
      const models = await window.metisNote.llmModels.list()
      setHasEnabledModel(models.some((model) => model.enabled))
    } catch {
      setHasEnabledModel(false)
    }
  }

  function setNoteLinkPickerState(nextState: NoteLinkPickerState | null) {
    noteLinkPickerStateRef.current = nextState
    setNoteLinkPicker(nextState)
  }

  function scheduleEditorSelectionWork(work: () => void) {
    window.requestAnimationFrame(() => {
      work()
    })
  }

  async function refreshBacklinks(currentNoteId: string) {
    try {
      const nextBacklinks = await window.metisNote.noteLinks.getBacklinks(currentNoteId)
      setBacklinks(nextBacklinks)
    } catch {
      setBacklinks([])
    }
  }

  async function resolveCurrentNoteLinks(noteIds: string[], force = false) {
    const normalizedIds = [...new Set(noteIds.map((noteId) => noteId.trim()).filter(Boolean))]
    const previousIds = currentNoteLinkIdsRef.current
    const isSameSet =
      !force &&
      normalizedIds.length === previousIds.length &&
      normalizedIds.every((noteId, index) => noteId === previousIds[index])

    if (isSameSet) {
      return
    }

    currentNoteLinkIdsRef.current = normalizedIds
    const requestId = noteLinkResolutionRequestRef.current + 1
    noteLinkResolutionRequestRef.current = requestId

    if (normalizedIds.length === 0) {
      noteLinkRenderStoreRef.current.replace({})
      return
    }

    const notesById = new Map(allNotes.map((item) => [item.id, item]))
    const optimistic = Object.fromEntries(
      normalizedIds.map((noteId) => {
        const matched = notesById.get(noteId)

        return [
          noteId,
          {
            title: matched?.title ?? "",
            exists: matched?.status === "active",
          },
        ]
      }),
    ) satisfies NoteLinkResolutionMap
    noteLinkRenderStoreRef.current.replace(optimistic)

    try {
      const resolved = await window.metisNote.noteLinks.resolveLinks(normalizedIds)

      if (noteLinkResolutionRequestRef.current !== requestId) {
        return
      }

      noteLinkRenderStoreRef.current.replace(resolved)
    } catch {
      if (noteLinkResolutionRequestRef.current !== requestId) {
        return
      }

      const fallback = Object.fromEntries(
        normalizedIds.map((noteId) => [
          noteId,
          {
            title: "",
            exists: false,
          },
        ]),
      ) satisfies NoteLinkResolutionMap
      noteLinkRenderStoreRef.current.replace(fallback)
    }
  }

  function openNoteLinkPicker(replaceRange: NoteLinkPickerState["replaceRange"], initialQuery = "") {
    const position = resolveOverlayPosition(replaceRange.to, 360)

    if (!position) {
      return
    }

    setSlashCommand(null)
    setNoteLinkPickerState({
      replaceRange,
      position,
      query: initialQuery,
      selectedIndex: 0,
    })
  }

  function closeNoteLinkPicker(restoreFocus = false) {
    const currentPicker = noteLinkPickerStateRef.current

    setNoteLinkPickerState(null)

    if (currentPicker && restoreFocus && editor) {
      const focusPosition = currentPicker.replaceRange.to

      scheduleEditorSelectionWork(() => {
        editor.chain().focus(focusPosition).run()
      })
    }
  }

  function openTableInsertPicker(options: {
    source: "toolbar" | "slash"
    insertPosition?: number
    position?: AiWritePanelPosition | null
  }) {
    if (!editor) {
      return
    }

    setSlashCommand(null)
    setNoteLinkPickerState(null)
    setTableInsertPicker(null)
    setActiveTableMenu(null)
    setIsFormatMenuOpen(false)
    setIsHighlightMenuOpen(false)

    const insertPosition = options.insertPosition ?? editor.state.selection.from
    const position =
      options.source === "slash"
        ? options.position ??
          resolveOverlayPosition(insertPosition, 272) ?? {
            top: 24,
            left: 24,
          }
        : null

    setTableInsertPicker({
      source: options.source,
      insertPosition,
      position,
      rows: 3,
      cols: 3,
    })
  }

  function closeTableInsertPicker(restoreFocus = false) {
    const currentPicker = tableInsertPickerStateRef.current
    setTableInsertPicker(null)

    if (restoreFocus && currentPicker && editor) {
      scheduleEditorSelectionWork(() => {
        editor.chain().focus(currentPicker.insertPosition).run()
      })
    }
  }

  function handleSelectTableSize(rows: number, cols: number) {
    const currentPicker = tableInsertPickerStateRef.current

    if (!editor || !currentPicker) {
      return
    }

    editor.chain().focus(currentPicker.insertPosition).insertTable({ rows, cols, withHeaderRow: true }).run()
    setTableInsertPicker(null)
  }
  const editor = useEditor(
    {
      editable: canEditNote && isEditing && !isVersionPreviewing,
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3],
          },
          codeBlock: false,
        }),
        Underline,
        ManagedSubscript,
        ManagedSuperscript,
        Highlight.configure({
          multicolor: true,
          HTMLAttributes: {
            class: "metis-highlight",
          },
        }),
        Typography,
        TextAlign.configure({
          types: ["heading", "paragraph"],
          alignments: ["left", "center", "right"],
          defaultAlignment: "left",
        }),
        TaskList,
        TaskItem.configure({
          nested: true,
          onReadOnlyChecked: (node, checked) => {
            const currentEditor = editorRef.current

            if (!currentEditor) {
              return false
            }

            let taskItemPosition: number | null = null

            currentEditor.state.doc.descendants((candidate, position) => {
              if (candidate === node) {
                taskItemPosition = position
                return false
              }

              return undefined
            })

            if (taskItemPosition === null) {
              return false
            }

            const position = taskItemPosition

            currentEditor
              .chain()
              .focus(undefined, { scrollIntoView: false })
              .command(({ tr }) => {
                const currentNode = tr.doc.nodeAt(position)

                if (!currentNode) {
                  return false
                }

                tr.setNodeMarkup(position, undefined, {
                  ...currentNode.attrs,
                  checked,
                })

                return true
              })
              .run()

            return true
          },
        }),
        ManagedImage.configure({
          onPreviewImage: (source, alt) => {
            setLightboxImage({
              src: source,
              alt,
            })
          },
          onReplaceImage: async () => {
            if (!note) {
              return null
            }

            try {
              const imported = await window.metisNote.assets.pickAndImportImage(note.id)

              if (!imported) {
                return null
              }

              return {
                src: imported.src,
                alt: stripFileExtension(imported.originalFilename),
                title: imported.originalFilename,
                width: imported.width,
                height: imported.height,
                size: imported.size,
              }
            } catch (error) {
              showAssetError(error, messages.editor.assets.importImageFailed)
              return null
            }
          },
          previewLabel: messages.editor.assets.previewImage,
          replaceLabel: messages.editor.assets.replaceImage,
          removeLabel: messages.editor.assets.removeAsset,
        }),
        FileAttachment.configure({
          onOpenFile: (source) => {
            void window.metisNote.assets.openFile(source).catch((error) => {
              window.alert(error instanceof Error ? error.message : messages.editor.assets.assetNotFound)
            })
          },
          openLabel: messages.editor.assets.openAttachment,
          removeLabel: messages.editor.assets.removeAsset,
        }),
        ManagedCodeBlock.configure({
          lowlight,
          defaultLanguage: "plaintext",
          copyLabel: messages.editor.codeBlock.copyLabel,
          copiedLabel: messages.editor.codeBlock.copiedLabel,
          languageLabel: messages.editor.codeBlock.languageLabel,
          languagePlaceholder: messages.editor.codeBlock.languagePlaceholder,
        }),
        Link.configure({
          autolink: true,
          linkOnPaste: true,
          openOnClick: false,
          HTMLAttributes: {
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        }),
        NoteLink.configure({
          renderStore: noteLinkRenderStoreRef.current,
          deletedTooltip: messages.editor.noteLinks.deletedTooltip,
          modifierHint: messages.editor.noteLinks.modifierHint,
          getPathLabel: (noteId) => notePathLabelsRef.current.get(noteId) ?? null,
          onOpenNote: (noteId) => openLinkedNoteRef.current(noteId),
        }),
        ManagedTable.configure({
          resizable: true,
          renderWrapper: true,
        }),
        TableRow,
        TableHeader,
        TableCell,
        Details.configure({
          persist: true,
          HTMLAttributes: {
            class: "metis-note-details",
          },
        }),
        DetailsSummary.configure({
          HTMLAttributes: {
            class: "metis-note-details-summary",
          },
        }),
        DetailsContent.configure({
          HTMLAttributes: {
            class: "metis-note-details-content",
          },
        }),
        Mathematics.configure({
          regex: MATH_EXPRESSION_REGEX,
          katexOptions: {
            throwOnError: false,
            strict: "ignore",
          },
        }),
        MathBlock.configure({
          placeholder: "E = mc^2",
        }),
        Placeholder.configure({
          placeholder: messages.editor.contentPlaceholder,
          showOnlyWhenEditable: true,
        }),
      ],
      content: note?.content ?? emptyDocument,
      editorProps: {
        attributes: {
          class: "ProseMirror px-0 py-0 text-[16px] leading-[1.75rem] text-[#344054] focus:outline-none",
        },
        handleKeyDown(_view, event) {
          const currentTableInsertPicker = tableInsertPickerStateRef.current

          if (currentTableInsertPicker) {
            if (event.key === "Escape") {
              event.preventDefault()
              closeTableInsertPicker(true)
              return true
            }

            if (event.key === "Enter") {
              event.preventDefault()
              handleSelectTableSize(currentTableInsertPicker.rows, currentTableInsertPicker.cols)
              return true
            }
          }

          const currentSlashCommand = slashCommandRef.current
          const currentSlashCommands = slashCommandsRef.current

          if (currentSlashCommand && currentSlashCommands.length > 0) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault()
              setSlashCommand((current) => {
                if (!current) {
                  return current
                }

                const offset = event.key === "ArrowDown" ? 1 : -1
                const nextIndex = (current.selectedIndex + offset + currentSlashCommands.length) % currentSlashCommands.length

                return {
                  ...current,
                  selectedIndex: nextIndex,
                }
              })
              return true
            }

            if (event.key === "Enter") {
              event.preventDefault()
              runSelectedSlashCommandRef.current()
              return true
            }

            if (event.key === "Escape") {
              event.preventDefault()
              setSlashCommand(null)
              return true
            }
          }

          const currentAiWriteState = aiWriteStateRef.current

          if (currentAiWriteState) {
            if (event.key === "Escape") {
              event.preventDefault()
              cancelAiWriteRef.current()
              return true
            }

            if (currentAiWriteState.status === "done" && event.key === "Enter") {
              event.preventDefault()
              confirmAiWriteRef.current()
              return true
            }
          }

          if (tocOpenRef.current && event.key === "Escape") {
            event.preventDefault()
            setIsTocOpen(false)
            return true
          }

          return false
        },
        handlePaste(_view, event) {
          if (!canEditNote || !isEditing || isVersionPreviewing) {
            return false
          }

          const files = Array.from(event.clipboardData?.files ?? []) as EditorAssetFile[]

          if (files.length === 0) {
            return false
          }

          event.preventDefault()
          void handleInsertAssetFiles(files)
          return true
        },
        handleDrop(view, event, _slice, moved) {
          if (!canEditNote || !isEditing || isVersionPreviewing) {
            return false
          }

          if (moved) {
            return false
          }

          const files = Array.from(event.dataTransfer?.files ?? []) as EditorAssetFile[]

          if (files.length === 0) {
            return false
          }

          const coordinates = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })

          event.preventDefault()
          void handleInsertAssetFiles(files, coordinates?.pos)
          return true
        },
      },
      onUpdate({ editor: currentEditor }) {
        if (syncingEditorContentRef.current || isVersionPreviewingRef.current) {
          return
        }

        onContentChange(currentEditor.getJSON(), currentEditor.getText())
      },
    },
    [
      canEditNote,
      isVersionPreviewing,
      isEditing,
      messages.editor.assets.assetNotFound,
      messages.editor.assets.importFileFailed,
      messages.editor.assets.importImageFailed,
      messages.editor.assets.openAttachment,
      messages.editor.assets.previewImage,
      messages.editor.assets.replaceImage,
      messages.editor.assets.removeAsset,
      messages.editor.contentPlaceholder,
      messages.editor.noteLinks.deletedTooltip,
      messages.editor.noteLinks.modifierHint,
        emptyDocument,
        note?.id,
        note?.status,
      ],
    )

  const tocItems = useMemo(() => buildTocItems(editor ?? null), [editor, note?.content, note?.id])
  const activeTocPos = useMemo(() => {
    if (visibleTocPos !== null) {
      return visibleTocPos
    }

    if (!editor || tocItems.length === 0) {
      return null
    }

    const selectionPosition = editor.state.selection.from
    let activePos = tocItems[0]?.pos ?? null

    for (const item of tocItems) {
      if (item.pos <= selectionPosition) {
        activePos = item.pos
      } else {
        break
      }
    }

    return activePos
  }, [editor, note?.content, note?.id, tocItems, visibleTocPos])
  const versionHistoryItems = useMemo<VersionHistoryListItem[]>(() => {
    if (!note) {
      return []
    }

    return [
      {
        timestamp: null,
        title: formatVersionTimestamp(locale, note.updatedAt),
        meta: messages.editor.versionHistory.currentMeta(note.wordCount),
        previewText: note.preview,
        isCurrent: true,
      },
      ...versionSummaries.map((version) => ({
        timestamp: version.timestamp,
        title: formatVersionTimestamp(locale, version.timestamp),
        meta: messages.editor.wordCount(version.wordCount),
        previewText: version.previewText,
        isCurrent: false,
      })),
    ]
  }, [locale, messages.editor.versionHistory, messages.editor.wordCount, note, versionSummaries])
  const isTableEditingActive = Boolean(editor && canEditNote && isEditing && !isVersionPreviewing && editor.isActive("table"))
  const selectedTable = editor ? findSelectedTable(editor.state) : null
  const isTableIndexColumnEnabled = Boolean(selectedTable?.node.attrs.indexColumn)
  const canInsertColumnBefore = Boolean(editor && isTableEditingActive && editor.can().addColumnBefore())
  const canInsertColumnAfter = Boolean(editor && isTableEditingActive && editor.can().addColumnAfter())
  const canDeleteCurrentColumn = Boolean(editor && isTableEditingActive && editor.can().deleteColumn())
  const canInsertRowAbove = Boolean(editor && isTableEditingActive && editor.can().addRowBefore())
  const canInsertRowBelow = Boolean(editor && isTableEditingActive && editor.can().addRowAfter())
  const canDeleteCurrentRow = Boolean(editor && isTableEditingActive && editor.can().deleteRow())
  const canMergeCells = Boolean(editor && isTableEditingActive && editor.can().mergeCells())
  const canSplitCell = Boolean(editor && isTableEditingActive && editor.can().splitCell())
  const canToggleHeaderRow = Boolean(editor && isTableEditingActive && editor.can().toggleHeaderRow())
  const canToggleHeaderColumn = Boolean(editor && isTableEditingActive && editor.can().toggleHeaderColumn())
  const canDeleteCurrentTable = Boolean(editor && isTableEditingActive && editor.can().deleteTable())

  function handleToggleTableIndexColumn() {
    if (!editor) {
      return
    }

    const didToggle = editor
      .chain()
      .focus(undefined, { scrollIntoView: false })
      .command(({ tr, state }) => {
        const table = findSelectedTable(state)

        if (!table) {
          return false
        }

        const nextIndexColumnEnabled = !Boolean(table.node.attrs.indexColumn)

        tr.setNodeMarkup(table.pos, undefined, {
          ...table.node.attrs,
          indexColumn: nextIndexColumnEnabled,
        })

        if (nextIndexColumnEnabled) {
          syncIndexedTableAtPosition(tr, table.pos)
        }

        return true
      })
      .run()

    if (didToggle) {
      setActiveTableMenu(null)
    }
  }

  useEffect(() => {
    editorRef.current = editor ?? null
  }, [editor])

  useEffect(() => {
    lastSyncedExternalContentRef.current = null
  }, [editor])

  useEffect(() => {
    tocOpenRef.current = isTocOpen
  }, [isTocOpen])

  useEffect(() => {
    isVersionPreviewingRef.current = isVersionPreviewing
  }, [isVersionPreviewing])

  useEffect(() => {
    if (!editor) {
      return
    }

    if (lastSyncedExternalContentRef.current === displayedContentSnapshot) {
      return
    }

    const nextSnapshot = displayedContentSnapshot
    const currentSnapshot = JSON.stringify(editor.getJSON())

    lastSyncedExternalContentRef.current = nextSnapshot

    if (nextSnapshot === currentSnapshot) {
      return
    }

    syncingEditorContentRef.current = true
    editor.commands.setContent(displayedContent, false)
    queueMicrotask(() => {
      syncingEditorContentRef.current = false
    })
  }, [displayedContent, displayedContentSnapshot, editor])

  useEffect(() => {
    setIsEditing(false)
    setIsTitleEditing(false)
    setTitleDraft(note?.title ?? "")
    setIsMoreMenuOpen(false)
    setIsFormatMenuOpen(false)
    setIsHighlightMenuOpen(false)
    setIsTocOpen(false)
    setIsVersionPanelOpen(false)
    setVersionSummaries([])
    setSelectedVersionTimestamp(null)
    setSelectedVersionContent(null)
    setIsLoadingVersions(false)
    setIsRestoringVersion(false)
    setVisibleTocPos(null)
    setLightboxImage(null)
    setTableInsertPicker(null)
  }, [note?.id, note?.status])

  useEffect(() => {
    if (!isFocusMode) {
      return
    }

    setIsMoreMenuOpen(false)
    setIsFormatMenuOpen(false)
    setIsHighlightMenuOpen(false)
    setIsVersionPanelOpen(false)
    setIsTocOpen(false)
  }, [isFocusMode])

  useEffect(() => {
    if (!note?.id || note.status !== "active") {
      setVersionSummaries([])
      return
    }

    void refreshVersionHistory()
  }, [note?.id, note?.status, note?.updatedAt])

  useEffect(() => {
    if (!isTitleEditing) {
      setTitleDraft(note?.title ?? "")
    }
  }, [isTitleEditing, note?.title])

  useEffect(() => {
    const nextIsEditing = canEditNote && requestedMode === "edit"
    setIsEditing(nextIsEditing)

    if (!nextIsEditing) {
      setIsTitleEditing(false)
      setIsHighlightMenuOpen(false)
    }
  }, [canEditNote, modeRequestId, requestedMode])

  useEffect(() => {
    editor?.setEditable(canEditNote && isEditing && !isVersionPreviewing)
  }, [canEditNote, editor, isEditing, isVersionPreviewing])

  useEffect(() => {
    if (!isEditing || !canEditNote || isVersionPreviewing) {
      return
    }

    editor?.chain().focus("end").run()
  }, [canEditNote, editor, isEditing, isVersionPreviewing])

  useEffect(() => {
    if (!editor || tocItems.length === 0) {
      setVisibleTocPos(null)
      return
    }

    const currentEditor = editor
    const scrollContainer = editorSurfaceRef.current?.closest("[data-note-editor-scroll]")

    if (!(scrollContainer instanceof HTMLElement)) {
      setVisibleTocPos(null)
      return
    }

    const scrollElement = scrollContainer

    let frameId = 0

    function updateVisibleHeading() {
      frameId = 0
      const containerTop = scrollElement.getBoundingClientRect().top + 96
      let nextVisiblePos = tocItems[0]?.pos ?? null

      for (const item of tocItems) {
        const domNode = currentEditor.view.nodeDOM(item.pos)

        if (!(domNode instanceof HTMLElement)) {
          continue
        }

        const headingTop = domNode.getBoundingClientRect().top

        if (headingTop <= containerTop) {
          nextVisiblePos = item.pos
        } else {
          break
        }
      }

      setVisibleTocPos(nextVisiblePos)
    }

    function handleScrollOrResize() {
      if (frameId !== 0) {
        return
      }

      frameId = window.requestAnimationFrame(updateVisibleHeading)
    }

    updateVisibleHeading()
    scrollElement.addEventListener("scroll", handleScrollOrResize, { passive: true })
    window.addEventListener("resize", handleScrollOrResize)

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId)
      }

      scrollElement.removeEventListener("scroll", handleScrollOrResize)
      window.removeEventListener("resize", handleScrollOrResize)
    }
  }, [editor, tocItems, note?.content, note?.id])

  useEffect(() => {
    if (!isMoreMenuOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current?.contains(event.target as Node)) {
        return
      }

      setIsMoreMenuOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMoreMenuOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isMoreMenuOpen])

  useEffect(() => {
    if (!isHighlightMenuOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (highlightMenuRef.current?.contains(event.target as Node)) {
        return
      }

      setIsHighlightMenuOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsHighlightMenuOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isHighlightMenuOpen])

  useEffect(() => {
    if (!isFormatMenuOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (formatMenuRef.current?.contains(event.target as Node)) {
        return
      }

      setIsFormatMenuOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsFormatMenuOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isFormatMenuOpen])

  useEffect(() => {
    if (!activeTableMenu) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (tableMenuRef.current?.contains(event.target as Node)) {
        return
      }

      setActiveTableMenu(null)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveTableMenu(null)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [activeTableMenu])

  const visibleSlashCommands = useMemo(() => {
    if (!slashCommand) {
      return []
    }

    return slashCommandItems.filter((command) =>
      matchesSlashCommandQuery(slashCommand.query, [command.label, command.description, ...command.keywords]),
    )
  }, [slashCommand, slashCommandItems])

  useEffect(() => {
    slashCommandRef.current = slashCommand
  }, [slashCommand])

  useEffect(() => {
    aiWriteStateRef.current = aiWriteState
  }, [aiWriteState])

  useEffect(() => {
    noteLinkPickerStateRef.current = noteLinkPicker
  }, [noteLinkPicker])

  useEffect(() => {
    tableInsertPickerStateRef.current = tableInsertPicker
  }, [tableInsertPicker])

  useEffect(() => {
    notePathLabelsRef.current = notePathLabels
  }, [notePathLabels])

  useEffect(() => {
    openLinkedNoteRef.current = onOpenLinkedNote
  }, [onOpenLinkedNote])

  useEffect(() => {
    slashCommandsRef.current = visibleSlashCommands
  }, [visibleSlashCommands])

  useEffect(() => {
    const current = noteLinkPickerStateRef.current

    if (!current) {
      return
    }

    const nextIndex = Math.min(current.selectedIndex, Math.max(0, noteLinkPickerItems.length - 1))

    if (nextIndex === current.selectedIndex) {
      return
    }

    setNoteLinkPickerState({
      ...current,
      selectedIndex: nextIndex,
    })
  }, [noteLinkPickerItems.length])

  useEffect(() => {
    if (!canEditNote || !isEditing || isVersionPreviewing) {
      setHasEnabledModel(false)
      return
    }

    void refreshEnabledModelAvailability()
  }, [canEditNote, isEditing, isVersionPreviewing, note?.id])

  useEffect(() => {
    void resolveCurrentNoteLinks(extractNoteLinkIds(note?.content ?? null))
  }, [note?.content, note?.id, note?.status])

  useEffect(() => {
    if (!isTableEditingActive) {
      setActiveTableMenu(null)
    }
  }, [isTableEditingActive])

  useEffect(() => {
    if (!note?.id || note.status !== "active") {
      setBacklinks([])
      return
    }

    void refreshBacklinks(note.id)
    void resolveCurrentNoteLinks(currentNoteLinkIdsRef.current, true)
  }, [allNotes, note?.id, note?.status])

  useEffect(() => {
    if (!editor) {
      return
    }

    const currentEditor = editor

    function getMatchingSlashCommands(query: string) {
      return slashCommandItems.filter((command) =>
        matchesSlashCommandQuery(query, [command.label, command.description, ...command.keywords]),
      )
    }

    function syncCommands() {
      if (!canEditNote || !isEditing || isVersionPreviewingRef.current || aiWriteStateRef.current || noteLinkPickerStateRef.current) {
        setSlashCommand(null)
        return
      }

        if (linkableNotes.length > 0) {
          const wikiMatch = getNoteLinkTriggerMatch(currentEditor)

          if (wikiMatch) {
            openNoteLinkPicker(wikiMatch.range, wikiMatch.query)
            return
          }
        }

      const match = getSlashCommandMatch(currentEditor)

      if (!match) {
        setSlashCommand(null)
        return
      }

      if (getMatchingSlashCommands(match.query).length === 0) {
        setSlashCommand(null)
        return
      }

      const position = resolveOverlayPosition(match.range.to, 280)

      if (!position) {
        setSlashCommand(null)
        return
      }

      setSlashCommand((current) => ({
        query: match.query,
        range: match.range,
        position,
        selectedIndex:
          current && current.query === match.query
            ? Math.min(current.selectedIndex, Math.max(0, getMatchingSlashCommands(match.query).length - 1))
            : 0,
        }))
    }

    function handleTransaction({ transaction }: { transaction: { docChanged: boolean; mapping: { map: (position: number) => number } } }) {
      if (transaction.docChanged) {
        void resolveCurrentNoteLinks(extractNoteLinkIds(currentEditor.getJSON()))
      }

      const currentAiWriteState = aiWriteStateRef.current

      if (currentAiWriteState) {
        if (!transaction.docChanged) {
          return
        }

        const nextInsertPosition = transaction.mapping.map(currentAiWriteState.insertPosition)
        const nextPosition = resolveOverlayPosition(nextInsertPosition, 520) ?? currentAiWriteState.position

        setAiWriteState((current) =>
          current
            ? {
                ...current,
                insertPosition: nextInsertPosition,
                position: nextPosition,
              }
            : current,
        )
        return
      }

      const currentNoteLinkPicker = noteLinkPickerStateRef.current

      if (currentNoteLinkPicker) {
        if (!transaction.docChanged) {
          return
        }

        const nextRange = {
          from: transaction.mapping.map(currentNoteLinkPicker.replaceRange.from),
          to: transaction.mapping.map(currentNoteLinkPicker.replaceRange.to),
        }
        const nextPosition = resolveOverlayPosition(nextRange.to, 360) ?? currentNoteLinkPicker.position

        setNoteLinkPickerState({
          ...currentNoteLinkPicker,
          replaceRange: nextRange,
          position: nextPosition,
        })
        return
      }

      syncCommands()
    }

    void resolveCurrentNoteLinks(extractNoteLinkIds(currentEditor.getJSON()), true)
    syncCommands()
    currentEditor.on("selectionUpdate", syncCommands)
    currentEditor.on("transaction", handleTransaction)

    return () => {
      currentEditor.off("selectionUpdate", syncCommands)
      currentEditor.off("transaction", handleTransaction)
    }
  }, [
    canEditNote,
    editor,
    isEditing,
    slashCommandItems,
  ])

  useEffect(() => {
    if (!slashCommand) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (slashMenuRef.current?.contains(event.target as Node)) {
        return
      }

      setSlashCommand(null)
    }

    document.addEventListener("mousedown", handlePointerDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
    }
  }, [slashCommand])

  useEffect(() => {
    if (!noteLinkPicker) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (noteLinkPickerRef.current?.contains(event.target as Node)) {
        return
      }

      closeNoteLinkPicker()
    }

    document.addEventListener("mousedown", handlePointerDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
    }
  }, [noteLinkPicker])

  useEffect(() => {
    if (!tableInsertPicker) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node

      if (tableInsertPickerRef.current?.contains(target) || tableToolbarPickerRef.current?.contains(target)) {
        return
      }

      closeTableInsertPicker()
    }

    document.addEventListener("mousedown", handlePointerDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
    }
  }, [tableInsertPicker])

  useEffect(() => {
    const removeChunkListener = window.metisNote.llm.onStreamChunk((streamId, chunk) => {
      setAiWriteState((current) => {
        if (!current || current.streamId !== streamId) {
          return current
        }

        return {
          ...current,
          status: "writing",
          generatedText: `${current.generatedText}${chunk}`,
        }
      })
    })

    const removeEndListener = window.metisNote.llm.onStreamEnd((streamId) => {
      setAiWriteState((current) => {
        if (!current || current.streamId !== streamId) {
          return current
        }

        if (!current.generatedText.trim()) {
          return {
            ...current,
            status: "error",
            errorMessage: messages.editor.aiWrite.emptyResponseError,
          }
        }

        return {
          ...current,
          status: "done",
          errorMessage: null,
        }
      })
    })

    const removeErrorListener = window.metisNote.llm.onStreamError((streamId, error) => {
      setAiWriteState((current) => {
        if (!current || current.streamId !== streamId) {
          return current
        }

        return {
          ...current,
          status: "error",
          errorMessage: error || messages.editor.aiWrite.requestFailed,
        }
      })
    })

    return () => {
      removeChunkListener()
      removeEndListener()
      removeErrorListener()
    }
  }, [messages.editor.aiWrite.emptyResponseError, messages.editor.aiWrite.requestFailed])

  useEffect(() => {
    if (canEditNote && isEditing && !isVersionPreviewing) {
      return
    }

    const currentAiWriteState = aiWriteStateRef.current

    setSlashCommand(null)
    setNoteLinkPickerState(null)
    setAiWriteState(null)
    setTableInsertPicker(null)
    setActiveTableMenu(null)

    if (currentAiWriteState?.streamId) {
      void window.metisNote.llm.cancelStream(currentAiWriteState.streamId).catch(() => undefined)
    }
  }, [canEditNote, isEditing, isVersionPreviewing, note?.id])

  useEffect(() => {
    return () => {
      const currentAiWriteState = aiWriteStateRef.current

      if (currentAiWriteState?.streamId) {
        void window.metisNote.llm.cancelStream(currentAiWriteState.streamId).catch(() => undefined)
      }
    }
  }, [])

  async function startAiWriteStream(
    request: LlmStreamChatParams,
    insertPosition: number,
    position: AiWritePanelPosition,
    context: AiWriteContext,
    userInstruction: string,
  ) {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    setSlashCommand(null)
    setNoteLinkPickerState(null)
    setActiveTableMenu(null)
    setAiWriteState({
      requestId,
      streamId: null,
      insertPosition,
      position,
      status: "thinking",
      context,
      userInstruction,
      generatedText: "",
      errorMessage: null,
      request,
    })

    try {
      const { streamId } = await window.metisNote.llm.startStreamChat(request)

      setAiWriteState((current) =>
        current && current.requestId === requestId
          ? {
              ...current,
              streamId,
            }
          : current,
      )
    } catch (error) {
      setAiWriteState((current) =>
        current && current.requestId === requestId
          ? {
              ...current,
              status: "error",
              errorMessage: error instanceof Error ? error.message : messages.editor.aiWrite.requestFailed,
            }
          : current,
      )
    }
  }

  function handleCancelAiWrite() {
    const currentAiWriteState = aiWriteStateRef.current

    if (!currentAiWriteState) {
      return
    }

    if (currentAiWriteState.streamId) {
      void window.metisNote.llm.cancelStream(currentAiWriteState.streamId).catch(() => undefined)
    }

    setAiWriteState(null)
    editor?.chain().focus(currentAiWriteState.insertPosition).run()
  }

  function handleConfirmAiWrite() {
    const currentAiWriteState = aiWriteStateRef.current

    if (!editor || !currentAiWriteState) {
      return
    }

    const content = buildAiWriteInsertContent(currentAiWriteState.generatedText)

    if (content.length === 0) {
      setAiWriteState((current) =>
        current
          ? {
              ...current,
              status: "error",
              errorMessage: messages.editor.aiWrite.emptyResponseError,
            }
          : current,
      )
      return
    }

    editor.chain().focus(currentAiWriteState.insertPosition).insertContent(content).run()
    setAiWriteState(null)
  }

  function handleRetryAiWrite() {
    const currentAiWriteState = aiWriteStateRef.current

    if (!currentAiWriteState || !currentAiWriteState.request) {
      return
    }

    const nextPosition = resolveOverlayPosition(currentAiWriteState.insertPosition, 520) ?? currentAiWriteState.position
    void startAiWriteStream(
      currentAiWriteState.request,
      currentAiWriteState.insertPosition,
      nextPosition,
      currentAiWriteState.context,
      currentAiWriteState.userInstruction,
    )
  }

  function triggerAiWriteFromSelection(fallbackPosition: AiWritePanelPosition | null = null) {
    if (!editor || !note || !canEditNote || !isEditing || aiWriteStateRef.current) {
      return
    }

    const insertPosition = editor.state.selection.from
    const context = collectAiWriteContext(editor, note.title, insertPosition)
    const position =
      resolveOverlayPosition(insertPosition, 520) ??
      fallbackPosition ?? {
        top: 20,
        left: 20,
      }

    setSlashCommand(null)
    setNoteLinkPickerState(null)
    setActiveTableMenu(null)
    setAiWriteState({
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      streamId: null,
      insertPosition,
      position,
      status: "prompting",
      context,
      userInstruction: "",
      generatedText: "",
      errorMessage: null,
      request: null,
    })
  }

  function handleAiWritePromptChange(value: string) {
    setAiWriteState((current) =>
      current
        ? {
            ...current,
            userInstruction: value,
            errorMessage: current.status === "prompting" ? null : current.errorMessage,
          }
        : current,
    )
  }

  function handleSubmitAiWritePrompt() {
    const currentAiWriteState = aiWriteStateRef.current

    if (!currentAiWriteState || currentAiWriteState.status !== "prompting") {
      return
    }

    const userInstruction = currentAiWriteState.userInstruction.trim()

    if (!userInstruction) {
      setAiWriteState((current) =>
        current
          ? {
              ...current,
              errorMessage: messages.editor.aiWrite.promptRequiredError,
            }
          : current,
      )
      return
    }

    const request: LlmStreamChatParams = {
      systemPrompt: getAiWriteSystemPrompt(locale),
      userPrompt: buildAiWriteUserPromptWithInstruction(locale, currentAiWriteState.context, userInstruction),
    }

    void startAiWriteStream(
      request,
      currentAiWriteState.insertPosition,
      currentAiWriteState.position,
      currentAiWriteState.context,
      userInstruction,
    )
  }

  function showAssetError(error: unknown, fallbackMessage: string) {
    window.alert(error instanceof Error ? error.message : fallbackMessage)
  }

  function createManagedImageNode(asset: ImageAssetResult): JSONContent {
    return {
      type: "image",
      attrs: {
        src: asset.src,
        alt: stripFileExtension(asset.originalFilename),
        title: asset.originalFilename,
        width: asset.width,
        height: asset.height,
        size: asset.size,
      },
    }
  }

  function createFileAttachmentNode(asset: FileAssetResult): JSONContent {
    return {
      type: "fileAttachment",
      attrs: {
        src: asset.src,
        filename: asset.originalFilename,
        size: asset.size,
        mimeType: asset.mimeType,
      },
    }
  }

  function isImageFile(file: EditorAssetFile) {
    return file.type.startsWith("image/") || isImageExtension(getFileExtension(file.name))
  }

  async function importEditorFile(file: EditorAssetFile) {
    if (!note) {
      throw new Error(messages.editor.assets.assetNotFound)
    }

    const filePath = typeof file.path === "string" && file.path.trim() ? file.path : null
    const payload = {
      noteId: note.id,
      filename: file.name || "asset",
      mimeType: file.type || undefined,
    }

    if (isImageFile(file)) {
      const imported = filePath
        ? await window.metisNote.assets.importImage({
            ...payload,
            sourcePath: filePath,
          })
        : await window.metisNote.assets.importImage({
            ...payload,
            bytes: new Uint8Array(await file.arrayBuffer()),
          })

      return createManagedImageNode(imported)
    }

    const imported = filePath
      ? await window.metisNote.assets.importFile({
          ...payload,
          sourcePath: filePath,
        })
      : await window.metisNote.assets.importFile({
          ...payload,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })

    return createFileAttachmentNode(imported)
  }

  async function handleInsertAssetFiles(files: EditorAssetFile[], position?: number) {
    if (!editor || !note || !canEditNote || !isEditing || isVersionPreviewing || files.length === 0) {
      return
    }

    setSlashCommand(null)
    setNoteLinkPickerState(null)
    setTableInsertPicker(null)
    setIsFormatMenuOpen(false)
    setIsHighlightMenuOpen(false)

    let nextPosition = position ?? editor.state.selection.from

    try {
      for (const file of files) {
        const contentNode = await importEditorFile(file)
        editor.chain().focus(nextPosition).insertContent(contentNode).run()
        nextPosition = editor.state.selection.from
      }
    } catch (error) {
      showAssetError(error, messages.editor.assets.importFileFailed)
    }
  }

  async function handlePickAndInsertImage() {
    if (!editor || !note || !canEditNote || !isEditing || isVersionPreviewing) {
      return
    }

    setSlashCommand(null)
    setNoteLinkPickerState(null)
    setTableInsertPicker(null)
    setActiveTableMenu(null)
    setIsFormatMenuOpen(false)
    setIsHighlightMenuOpen(false)

    try {
      const imported = await window.metisNote.assets.pickAndImportImage(note.id)

      if (!imported) {
        return
      }

      editor.chain().focus().insertContent(createManagedImageNode(imported)).run()
    } catch (error) {
      showAssetError(error, messages.editor.assets.importImageFailed)
    }
  }

  async function handlePickAndInsertFile() {
    if (!editor || !note || !canEditNote || !isEditing || isVersionPreviewing) {
      return
    }

    setSlashCommand(null)
    setNoteLinkPickerState(null)
    setTableInsertPicker(null)
    setActiveTableMenu(null)
    setIsHighlightMenuOpen(false)

    try {
      const imported = await window.metisNote.assets.pickAndImportFile(note.id)

      if (!imported) {
        return
      }

      editor.chain().focus().insertContent(createFileAttachmentNode(imported)).run()
    } catch (error) {
      showAssetError(error, messages.editor.assets.importFileFailed)
    }
  }

  function handleToggleHighlight(color: string = HIGHLIGHT_COLORS[0].value) {
    if (!editor) {
      return
    }

    editor.chain().focus().toggleHighlight({ color }).run()
    setIsFormatMenuOpen(false)
    setIsHighlightMenuOpen(false)
    setTableInsertPicker(null)
    setActiveTableMenu(null)
  }

  function handleSetTextAlign(alignment: "left" | "center" | "right") {
    if (!editor) {
      return
    }

    setTableInsertPicker(null)
    setActiveTableMenu(null)
    editor.chain().focus().setTextAlign(alignment).run()
  }

  function handleInsertTable() {
    if (!editor) {
      return
    }

    openTableInsertPicker({
      source: "toolbar",
      insertPosition: editor.state.selection.from,
    })
  }

  function handleInsertDetails() {
    if (!editor) {
      return
    }

    editor.chain().focus().setDetails().run()
  }

  function handleInsertInlineMath(position?: number) {
    if (!editor) {
      return
    }

    const insertPosition = position ?? editor.state.selection.from
    editor.chain().focus(insertPosition).insertContent("$$").setTextSelection(insertPosition + 1).run()
  }

  function handleToggleTocPanel(forceOpen?: boolean) {
    setIsTocOpen((current) => {
      const nextValue = typeof forceOpen === "boolean" ? forceOpen : !current

      if (nextValue) {
        editorSurfaceRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      }

      return nextValue
    })
  }

  function handleSelectTocItem(position: number) {
    if (!editor) {
      return
    }

    editor.chain().focus(position).setTextSelection(position).run()

    const domNode = editor.view.nodeDOM(position)

    if (domNode instanceof HTMLElement) {
      domNode.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }
  }

  async function refreshVersionHistory() {
    if (!note?.id || note.status !== "active") {
      setVersionSummaries([])
      return
    }

    setIsLoadingVersions(true)

    try {
      const versions = await window.metisNote.versions.list(note.id)
      setVersionSummaries(versions)
    } finally {
      setIsLoadingVersions(false)
    }
  }

  function clearVersionPreview() {
    setSelectedVersionTimestamp(null)
    setSelectedVersionContent(null)
  }

  function handleToggleVersionPanel(forceOpen?: boolean) {
    setIsVersionPanelOpen((current) => {
      const nextValue = typeof forceOpen === "boolean" ? forceOpen : !current

      if (nextValue && note?.id && note.status === "active") {
        void refreshVersionHistory()
      }

      if (!nextValue) {
        clearVersionPreview()
      }

      return nextValue
    })
  }

  async function handleSelectVersion(timestamp: string | null) {
    if (!note?.id || note.status !== "active") {
      return
    }

    if (!timestamp) {
      clearVersionPreview()
      return
    }

    try {
      const content = await window.metisNote.versions.get(note.id, timestamp)

      if (!content) {
        throw new Error(messages.editor.versionHistory.errors.versionNotFound)
      }

      setIsEditing(false)
      setIsTitleEditing(false)
      setIsMoreMenuOpen(false)
      setIsFormatMenuOpen(false)
      setIsHighlightMenuOpen(false)
      setIsTocOpen(false)
      setSlashCommand(null)
      setNoteLinkPickerState(null)
      setTableInsertPicker(null)
      setActiveTableMenu(null)
      setSelectedVersionTimestamp(timestamp)
      setSelectedVersionContent(content)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : messages.editor.versionHistory.errors.versionNotFound)
    }
  }

  async function handleRestoreVersionAction(timestamp: string) {
    if (!note?.id || note.status !== "active") {
      return
    }

    setIsRestoringVersion(true)

    try {
      await Promise.resolve(onRestoreVersion(timestamp))
      clearVersionPreview()
      setIsVersionPanelOpen(false)
      await refreshVersionHistory()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : messages.editor.versionHistory.errors.restoreFailed)
    } finally {
      setIsRestoringVersion(false)
    }
  }

  function handleOpenNoteLinkPickerFromToolbar() {
    if (!editor) {
      return
    }

    setIsFormatMenuOpen(false)
    setIsHighlightMenuOpen(false)
    setIsFormatMenuOpen(false)
    setIsVersionPanelOpen(false)
    setSlashCommand(null)
    setNoteLinkPickerState(null)
    setTableInsertPicker(null)
    setActiveTableMenu(null)

    const insertPosition = editor.state.selection.from

    openNoteLinkPicker({
      from: insertPosition,
      to: insertPosition,
    })
  }

  function handleRunSlashCommand(commandId: SlashCommandItem["id"]) {
    const currentSlashCommand = slashCommandRef.current
    const command = slashCommandsRef.current.find((item) => item.id === commandId) ?? null

    if (!editor || !currentSlashCommand || !command || command.disabled) {
      return
    }

    const insertPosition = currentSlashCommand.range.from

    editor.chain().focus().deleteRange(currentSlashCommand.range).run()
    setSlashCommand(null)
    setIsFormatMenuOpen(false)
    setIsHighlightMenuOpen(false)
    setTableInsertPicker(null)
    setActiveTableMenu(null)

    switch (command.id) {
      case "ai-write":
        triggerAiWriteFromSelection(currentSlashCommand.position)
        return
      case "note-link":
        openNoteLinkPicker({
          from: insertPosition,
          to: insertPosition,
        })
        return
      case "heading-1":
        editor.chain().focus(insertPosition).toggleHeading({ level: 1 }).run()
        return
      case "heading-2":
        editor.chain().focus(insertPosition).toggleHeading({ level: 2 }).run()
        return
      case "heading-3":
        editor.chain().focus(insertPosition).toggleHeading({ level: 3 }).run()
        return
      case "task-list":
        editor.chain().focus(insertPosition).toggleTaskList().run()
        return
      case "table":
        openTableInsertPicker({
          source: "slash",
          insertPosition,
          position: resolveOverlayPosition(insertPosition, 272) ?? currentSlashCommand.position,
        })
        return
      case "details":
        editor.chain().focus(insertPosition).setDetails().run()
        return
      case "math":
        handleInsertInlineMath(insertPosition)
        return
      case "image":
        void handlePickAndInsertImage()
        return
      case "file":
        void handlePickAndInsertFile()
        return
      case "toc":
        handleToggleTocPanel(true)
        return
      case "code-block":
        editor.chain().focus(insertPosition).toggleCodeBlock().run()
        return
      case "blockquote":
        editor.chain().focus(insertPosition).toggleBlockquote().run()
        return
      case "horizontal-rule":
        editor.chain().focus(insertPosition).setHorizontalRule().run()
        return
    }
  }

  function handleRunSelectedSlashCommand() {
    const currentSlashCommand = slashCommandRef.current
    const command = currentSlashCommand
      ? (slashCommandsRef.current[currentSlashCommand.selectedIndex] ?? slashCommandsRef.current[0])
      : null

    if (!command) {
      return
    }

    handleRunSlashCommand(command.id)
  }

  function handleSelectNoteLink(item: NoteLinkPickerItem) {
    const currentPicker = noteLinkPickerStateRef.current

    if (!editor || !currentPicker) {
      return
    }

    setNoteLinkPickerState(null)
    scheduleEditorSelectionWork(() => {
      editor
        .chain()
        .focus(currentPicker.replaceRange.to)
        .deleteRange(currentPicker.replaceRange)
        .insertContent(createNoteLinkNode(item.id, item.title, locale))
        .run()
    })
  }

  function handleToolbarAiWrite() {
    if (!editor || !hasEnabledModel) {
      return
    }

    setIsHighlightMenuOpen(false)
    setIsFormatMenuOpen(false)
    setIsVersionPanelOpen(false)
    setSlashCommand(null)
    setNoteLinkPickerState(null)
    setTableInsertPicker(null)
    setActiveTableMenu(null)
    editor.chain().focus().run()
    triggerAiWriteFromSelection(resolveOverlayPosition(editor.state.selection.from, 520))
  }

  confirmAiWriteRef.current = handleConfirmAiWrite
  cancelAiWriteRef.current = handleCancelAiWrite
  retryAiWriteRef.current = handleRetryAiWrite
  runSelectedSlashCommandRef.current = handleRunSelectedSlashCommand

  function beginTitleEdit() {
    if (!note || !canEditNote || isVersionPreviewing) {
      return
    }

    setTitleDraft(note.title)
    setIsTitleEditing(true)
  }

  function cancelTitleEdit() {
    setTitleDraft(note?.title ?? "")
    setIsTitleEditing(false)
  }

  function confirmTitleEdit() {
    if (!note || !canEditNote) {
      setIsTitleEditing(false)
      return
    }

    const nextTitle = titleDraft.trim() || messages.notes.emptyTitle

    if (nextTitle !== note.title) {
      onTitleChange(titleDraft)
      void onCommitEdits()
    }

    setIsTitleEditing(false)
  }

  async function handlePrimaryAction() {
    if (!canEditNote) {
      return
    }

    if (isVersionPreviewing) {
      clearVersionPreview()
      setIsEditing(false)
      return
    }

    if (!isEditing) {
      setIsEditing(true)
      return
    }

    if (isTitleEditing) {
      const nextTitle = titleDraft.trim() || messages.notes.emptyTitle

      if (nextTitle !== (note?.title ?? "")) {
        onTitleChange(titleDraft)
      }

      setIsTitleEditing(false)
    }

    setIsMoreMenuOpen(false)
    await Promise.resolve(onCommitEdits())
    setIsEditing(false)
  }

  function handleExportAction() {
    setIsMoreMenuOpen(false)
    onExportNote()
  }

  function handleExportPdfAction() {
    setIsMoreMenuOpen(false)
    void Promise.resolve(onExportPdf())
  }

  function handlePrintAction() {
    setIsMoreMenuOpen(false)
    void Promise.resolve(onPrintNote())
  }

  function handleSaveTemplateAction() {
    setIsMoreMenuOpen(false)
    void Promise.resolve(onSaveAsTemplate())
  }

  function handleDeleteAction() {
    setIsMoreMenuOpen(false)

    if (note?.status === "trashed") {
      onDeleteForever()
      return
    }

    onMoveToTrash()
  }

  const currentTextAlign = editor?.isActive({ textAlign: "center" })
    ? "center"
    : editor?.isActive({ textAlign: "right" })
      ? "right"
      : "left"
  const activeHighlightColor =
    editor?.isActive("highlight") && typeof editor.getAttributes("highlight").color === "string"
      ? (editor.getAttributes("highlight").color as string)
      : null
  const headerStatusLabel = formatStatusLabel(
    locale,
    messages.editor.unsaved,
    messages.editor.saving,
    isSaving,
    errorMessage,
    lastSavedAt,
  )
  const headerStatusClassName = errorMessage
    ? "border-[rgba(249,115,22,0.18)] bg-[rgba(255,247,237,0.92)] text-[#c2410c] dark:border-[rgba(249,115,22,0.24)] dark:bg-[rgba(154,52,18,0.16)] dark:text-[#fdba74]"
    : isSaving
      ? "border-[rgba(59,130,246,0.16)] bg-[rgba(239,244,255,0.96)] text-[#375bd2] dark:border-[rgba(59,130,246,0.22)] dark:bg-[#13233f] dark:text-[#93c5fd]"
      : "border-[#eef2f7] bg-[#f8fafc] text-[#8d95a2] dark:border-[#243041] dark:bg-[#0f172a] dark:text-slate-400"
  const headerStatusDotClassName = errorMessage ? "bg-[#f97316]" : isSaving ? "bg-[#60a5fa]" : "bg-[#84cc16]"
  const dragHandleTippyOptions = useMemo(
    () => ({
      placement: "left-start" as const,
      offset: [0, 0] as [number, number],
      duration: 0,
      zIndex: 40,
    }),
    [],
  )

  return (
    <section className="note-editor-shell flex h-full min-h-0 min-w-0 flex-col bg-white dark:bg-[#020817] dark:text-slate-100">
      {note ? (
        <div className="note-editor-header border-b border-[#eef2f7] px-5 py-2.5 dark:border-[#1f2937] md:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#eef4ff] text-[#4a7cff] dark:bg-[#13233f] dark:text-[#8eb8ff]">
                  <FileText className="h-4 w-4" />
                </span>

                {isTitleEditing && canEditNote ? (
                  <>
                    <input
                      autoFocus
                      className="min-w-[220px] flex-1 border-none bg-transparent p-0 text-[17px] font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-[#b5bcc7] dark:placeholder:text-slate-500 md:text-[18px]"
                      placeholder={messages.editor.titlePlaceholder}
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          confirmTitleEdit()
                        }

                        if (event.key === "Escape") {
                          event.preventDefault()
                          cancelTitleEdit()
                        }
                      }}
                    />

                    <div className="flex items-center gap-1.5">
                      <Button className="h-7 rounded-md px-2.5 text-[12px]" size="sm" onClick={confirmTitleEdit}>
                        {messages.editor.confirmTitleButton}
                      </Button>
                      <Button className="h-7 rounded-md px-2.5 text-[12px]" size="sm" variant="ghost" onClick={cancelTitleEdit}>
                        {messages.editor.cancelTitleButton}
                      </Button>
                    </div>
                  </>
                ) : (
                  <h1
                    className={cn(
                      "min-w-0 truncate text-[17px] font-semibold tracking-[-0.02em] text-foreground md:text-[18px]",
                      canEditNote && !isVersionPreviewing && "cursor-text",
                    )}
                    onDoubleClick={beginTitleEdit}
                  >
                    {note.title}
                  </h1>
                )}

                {!isFocusMode ? (
                  <span
                    className={cn(
                      "save-status inline-flex h-7 shrink-0 items-center gap-2 rounded-md border px-2.5 text-[12px] font-medium",
                      headerStatusClassName,
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", headerStatusDotClassName)} />
                    <span className="truncate">{headerStatusLabel}</span>
                  </span>
                ) : null}
              </div>

              {!isFocusMode && note.visibility === "public" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[12px] text-[#8d95a2] dark:text-slate-500">
                  {note.visibility === "public" ? <MetaPill>{messages.editor.publicVisibility}</MetaPill> : null}
                </div>
              ) : null}
            </div>

            <div className="editor-actions flex shrink-0 items-center gap-2">
              {note.status === "active" ? (
                <Button
                  className="h-9 w-9 rounded-lg px-0 text-[13px]"
                  variant={isFocusMode ? "default" : "outline"}
                  title={isFocusMode ? messages.editor.focusMode.exit : messages.editor.focusMode.enter}
                  onClick={onToggleFocusMode}
                >
                  {isFocusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              ) : null}

              {note.status === "active" && !isFocusMode ? (
                <Button
                  className="h-9 w-9 rounded-lg px-0 text-[13px]"
                  variant={isVersionPanelOpen ? "default" : "outline"}
                  title={messages.editor.versionHistory.button}
                  onClick={() => handleToggleVersionPanel()}
                >
                  <Clock3 className="h-4 w-4" />
                </Button>
              ) : null}

              {canEditNote ? (
                <Button
                  className="h-9 rounded-lg px-4 text-[13px] font-medium"
                  variant={isEditing || isVersionPreviewing ? "default" : "outline"}
                  onClick={() => {
                    void handlePrimaryAction()
                  }}
                >
                  {isVersionPreviewing
                    ? messages.editor.versionHistory.exitPreview
                    : isEditing
                      ? messages.editor.updateButton
                      : messages.editor.editButton}
                </Button>
              ) : null}

              {!isFocusMode ? (
                <div className="relative" ref={menuRef}>
                  <Button
                    className="h-9 w-9 rounded-lg px-0 text-[13px]"
                    title={messages.editor.moreButton}
                    variant="outline"
                    onClick={() => setIsMoreMenuOpen((current) => !current)}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>

                  {isMoreMenuOpen ? (
                    <div className="editor-floating-menu absolute right-0 top-[calc(100%+0.5rem)] z-20 w-48 rounded-xl border border-[#e7ebf1] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.12)] dark:border-[#243041] dark:bg-[#111827]">
                      {note.status === "active" && !isVersionPreviewing ? (
                        <MenuItemButton onClick={handleSaveTemplateAction}>
                          <FileText className="h-4 w-4 shrink-0" />
                          <span>{messages.editor.saveAsTemplateAction}</span>
                        </MenuItemButton>
                      ) : null}
                      <MenuItemButton onClick={handleExportAction}>
                        <Download className="h-4 w-4 shrink-0" />
                        <span>{messages.editor.exportAction}</span>
                      </MenuItemButton>
                      <MenuItemButton onClick={handleExportPdfAction}>
                        <FileText className="h-4 w-4 shrink-0" />
                        <span>{messages.editor.exportPdfAction}</span>
                      </MenuItemButton>
                      <MenuItemButton onClick={handlePrintAction}>
                        <Printer className="h-4 w-4 shrink-0" />
                        <span>{messages.editor.printAction}</span>
                      </MenuItemButton>
                      <MenuItemButton className="text-[#b42318]" onClick={handleDeleteAction}>
                        <Trash2 className="h-4 w-4 shrink-0" />
                        <span>{note.status === "trashed" ? messages.editor.deleteForeverAction : messages.editor.deleteAction}</span>
                      </MenuItemButton>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="note-editor-scroll min-h-0 flex-1 overflow-auto bg-white dark:bg-[#020817]" data-note-editor-scroll>
        {isLoading ? (
          <div className="flex h-full min-h-[460px] items-center justify-center px-8 text-center text-sm leading-7 text-muted-foreground">
            {messages.editor.loading}
          </div>
        ) : note ? (
          <div
            className={cn(
              "note-editor-page mx-auto flex min-h-full w-full flex-col px-8 py-8 md:px-10 md:py-8",
              isFocusMode ? "max-w-[860px]" : "max-w-[1140px]",
            )}
          >
            {note.status === "trashed" ? (
              <div className="mb-6 rounded-xl border border-[rgba(154,52,18,0.16)] bg-[rgba(154,52,18,0.05)] px-4 py-3 text-sm text-[rgba(121,44,18,0.92)] dark:bg-[rgba(180,35,24,0.08)] dark:text-[#fecaca]">
                {messages.editor.trashedReadonlyNotice}
              </div>
            ) : null}

            {!isFocusMode ? (
              <NoteBacklinks
                collapseLabel={messages.editor.noteLinks.backlinksCollapse}
                expandLabel={messages.editor.noteLinks.backlinksExpand}
                noteId={note.id}
                notes={backlinks}
                summaryLabel={messages.editor.noteLinks.backlinksSummary}
                onOpenNote={onOpenLinkedNote}
              />
            ) : null}

              <div className="flex min-h-0 flex-1 flex-col">
                {isVersionPreviewing && selectedVersionTimestamp ? (
                  <div className="mb-4 rounded-2xl border border-[#dbe6ff] bg-[#eef4ff] px-4 py-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-[#1f3045]">
                          {messages.editor.versionHistory.previewing(formatVersionTimestamp(locale, selectedVersionTimestamp))}
                        </div>
                        <div className="mt-1 text-sm text-[#667085]">{messages.editor.versionHistory.previewDescription}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          className="h-9 rounded-xl border-[#c7d7ff] bg-white px-3 text-sm text-[#1f3045]"
                          onClick={() => clearVersionPreview()}
                        >
                          {messages.editor.versionHistory.viewCurrent}
                        </Button>
                        <Button
                          className="h-9 rounded-xl px-3 text-sm"
                          disabled={isRestoringVersion}
                          onClick={() => {
                            void handleRestoreVersionAction(selectedVersionTimestamp)
                          }}
                        >
                          {messages.editor.versionHistory.restore}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {isEditing && !isVersionPreviewing ? (
                  <div className="toolbar note-editor-toolbar sticky top-0 z-20 -mx-8 -mt-8 mb-4 border-b border-[#eef2f7] bg-white/95 px-8 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/90 dark:border-[#1f2937] dark:bg-[#020817]/95 md:-mx-10 md:px-10">
                  <div className="flex flex-wrap items-center gap-y-2 text-[#667085] dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-0.5">
                      <ToolbarButton
                        active={editor?.isActive("heading", { level: 1 })}
                        disabled={isToolbarDisabled}
                        title={messages.editor.commands.heading1}
                        onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                      >
                        <span className="text-[12px] font-semibold">H1</span>
                      </ToolbarButton>
                      <ToolbarButton
                        active={editor?.isActive("heading", { level: 2 })}
                        disabled={isToolbarDisabled}
                        title={messages.editor.commands.heading2}
                        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                      >
                        <span className="text-[12px] font-semibold">H2</span>
                      </ToolbarButton>
                      <ToolbarButton
                        active={editor?.isActive("heading", { level: 3 })}
                        disabled={isToolbarDisabled}
                        title={messages.editor.commands.heading3}
                        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                      >
                        <span className="text-[12px] font-semibold">H3</span>
                      </ToolbarButton>
                    </div>

                    <ToolbarDivider />

                    <div className="flex flex-wrap items-center gap-0.5">
                      <ToolbarButton
                        active={editor?.isActive("bold")}
                        disabled={isToolbarDisabled}
                        title={messages.editor.formatting.bold}
                        onClick={() => editor?.chain().focus().toggleBold().run()}
                      >
                        <Bold className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        active={editor?.isActive("italic")}
                        disabled={isToolbarDisabled}
                        title={messages.editor.formatting.italic}
                        onClick={() => editor?.chain().focus().toggleItalic().run()}
                      >
                        <Italic className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        active={editor?.isActive("underline")}
                        disabled={isToolbarDisabled}
                        title={messages.editor.formatting.underline}
                        onClick={() => editor?.chain().focus().toggleUnderline().run()}
                      >
                        <UnderlineIcon className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        active={editor?.isActive("strike")}
                        disabled={isToolbarDisabled}
                        title={messages.editor.formatting.strike}
                        onClick={() => editor?.chain().focus().toggleStrike().run()}
                      >
                        <Strikethrough className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        active={editor?.isActive("code")}
                        disabled={isToolbarDisabled}
                        title={messages.editor.formatting.inlineCode}
                        onClick={() => editor?.chain().focus().toggleCode().run()}
                      >
                        <span className="text-[10px] font-semibold uppercase">&lt;/&gt;</span>
                      </ToolbarButton>
                      <div className="relative" ref={highlightMenuRef}>
                        <ToolbarButton
                          active={editor?.isActive("highlight")}
                          disabled={isToolbarDisabled}
                          title={messages.editor.formatting.highlight}
                          onClick={() => {
                            setIsFormatMenuOpen(false)
                            setIsHighlightMenuOpen((current) => !current)
                          }}
                        >
                          <Highlighter className="h-4 w-4" />
                        </ToolbarButton>

                        {isHighlightMenuOpen ? (
                          <div className="absolute left-0 top-[calc(100%+0.45rem)] z-30 w-[220px] rounded-2xl border border-[#e7ebf1] bg-white p-3 shadow-[0_18px_44px_rgba(15,23,42,0.12)]">
                            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#98a2b3]">
                              {messages.editor.formatting.highlight}
                            </div>
                            <div className="flex items-center gap-2">
                              {HIGHLIGHT_COLORS.map((color) => (
                                <button
                                  key={color.value}
                                  type="button"
                                  className={cn(
                                    "inline-flex h-9 w-9 items-center justify-center rounded-full border-2 transition hover:scale-[1.03]",
                                    activeHighlightColor === color.value
                                      ? "border-[#1f3045] shadow-[0_6px_14px_rgba(15,23,42,0.14)]"
                                      : "border-white shadow-[0_0_0_1px_rgba(148,163,184,0.18)]",
                                  )}
                                  onClick={() => handleToggleHighlight(color.value)}
                                >
                                  <span className={cn("h-5 w-5 rounded-full", color.swatchClassName)} />
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="mt-3 inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-[#667085] transition hover:bg-[#f8fafc] hover:text-[#1f3045]"
                              onClick={() => {
                                editor?.chain().focus().unsetHighlight().run()
                                setIsHighlightMenuOpen(false)
                              }}
                            >
                              {messages.editor.formatting.clearHighlight}
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="relative" ref={formatMenuRef}>
                        <ToolbarButton
                          active={editor?.isActive("subscript") || editor?.isActive("superscript")}
                          disabled={isToolbarDisabled}
                          title={messages.editor.formatting.more}
                          onClick={() => {
                            setIsHighlightMenuOpen(false)
                            setIsFormatMenuOpen((current) => !current)
                          }}
                        >
                          <Type className="h-4 w-4" />
                        </ToolbarButton>

                        {isFormatMenuOpen ? (
                          <div className="absolute left-0 top-[calc(100%+0.45rem)] z-30 w-[220px] rounded-2xl border border-[#e7ebf1] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.12)]">
                            <MenuItemButton
                              onClick={() => {
                                editor?.chain().focus().toggleSuperscript().run()
                                setIsFormatMenuOpen(false)
                              }}
                            >
                              <SuperscriptIcon className="h-4 w-4 shrink-0" />
                              <span>{messages.editor.formatting.superscript}</span>
                            </MenuItemButton>
                            <MenuItemButton
                              onClick={() => {
                                editor?.chain().focus().toggleSubscript().run()
                                setIsFormatMenuOpen(false)
                              }}
                            >
                              <SubscriptIcon className="h-4 w-4 shrink-0" />
                              <span>{messages.editor.formatting.subscript}</span>
                            </MenuItemButton>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <ToolbarDivider />

                    <div className="flex flex-wrap items-center gap-0.5">
                      <ToolbarButton
                        active={editor?.isActive("bulletList")}
                        disabled={isToolbarDisabled}
                        title={messages.editor.formatting.bulletList}
                        onClick={() => editor?.chain().focus().toggleBulletList().run()}
                      >
                        <List className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        active={editor?.isActive("orderedList")}
                        disabled={isToolbarDisabled}
                        title={messages.editor.formatting.orderedList}
                        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                      >
                        <ListOrdered className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        active={editor?.isActive("taskList")}
                        disabled={isToolbarDisabled}
                        title={messages.editor.commands.taskList}
                        onClick={() => editor?.chain().focus().toggleTaskList().run()}
                      >
                        <ListChecks className="h-4 w-4" />
                      </ToolbarButton>
                    </div>

                    {!isFocusMode ? (
                      <>
                      <ToolbarDivider />
                      <div className="flex flex-wrap items-center gap-0.5">
                      <ToolbarButton
                        active={currentTextAlign === "left"}
                        disabled={isToolbarDisabled}
                        title={messages.editor.formatting.alignLeft}
                        onClick={() => handleSetTextAlign("left")}
                      >
                        <AlignLeft className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        active={currentTextAlign === "center"}
                        disabled={isToolbarDisabled}
                        title={messages.editor.formatting.alignCenter}
                        onClick={() => handleSetTextAlign("center")}
                      >
                        <AlignCenter className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        active={currentTextAlign === "right"}
                        disabled={isToolbarDisabled}
                        title={messages.editor.formatting.alignRight}
                        onClick={() => handleSetTextAlign("right")}
                      >
                        <AlignRight className="h-4 w-4" />
                      </ToolbarButton>
                      </div>
                      </>
                    ) : null}

                    <ToolbarDivider />

                    {!isFocusMode ? (
                      <div className="flex flex-wrap items-center gap-0.5">
                      <ToolbarButton
                        active={editor?.isActive("blockquote")}
                        disabled={isToolbarDisabled}
                        title={messages.editor.commands.blockquote}
                        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                      >
                        <Quote className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        active={editor?.isActive("codeBlock")}
                        disabled={isToolbarDisabled}
                        title={messages.editor.commands.codeBlock}
                        onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
                      >
                        <Code2 className="h-4 w-4" />
                      </ToolbarButton>
                      <div className="relative" ref={tableToolbarPickerRef}>
                        <ToolbarButton
                          active={editor?.isActive("table") || tableInsertPicker?.source === "toolbar"}
                          disabled={isToolbarDisabled}
                          title={messages.editor.commands.table}
                          onClick={() => {
                            if (tableInsertPicker?.source === "toolbar") {
                              closeTableInsertPicker(true)
                              return
                            }

                            handleInsertTable()
                          }}
                        >
                          <span className="text-[10px] font-semibold uppercase">tbl</span>
                        </ToolbarButton>

                        {tableInsertPicker?.source === "toolbar" ? (
                          <div className="absolute left-0 top-full z-30 mt-2">
                            <TableInsertPicker
                              messages={messages.editor.tablePicker}
                              rows={tableInsertPicker.rows}
                              cols={tableInsertPicker.cols}
                              onClose={() => closeTableInsertPicker(true)}
                              onHoverSize={(rows, cols) => {
                                setTableInsertPicker((current) =>
                                  current
                                    ? {
                                        ...current,
                                        rows,
                                        cols,
                                      }
                                    : current,
                                )
                              }}
                              onSelectSize={handleSelectTableSize}
                            />
                          </div>
                        ) : null}
                      </div>
                      <ToolbarButton
                        active={editor?.isActive("details")}
                        disabled={isToolbarDisabled}
                        title={messages.editor.commands.details}
                        onClick={handleInsertDetails}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        disabled={isToolbarDisabled}
                        title={messages.editor.commands.math}
                        onClick={() => handleInsertInlineMath()}
                      >
                        <Sigma className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        disabled={isToolbarDisabled}
                        title={messages.editor.commands.horizontalRule}
                        onClick={() => editor?.chain().focus().setHorizontalRule().run()}
                      >
                        <Minus className="h-4 w-4" />
                      </ToolbarButton>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-0.5">
                        <ToolbarButton
                          active={editor?.isActive("blockquote")}
                          disabled={isToolbarDisabled}
                          title={messages.editor.commands.blockquote}
                          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                        >
                          <Quote className="h-4 w-4" />
                        </ToolbarButton>
                        <ToolbarButton
                          active={editor?.isActive("codeBlock")}
                          disabled={isToolbarDisabled}
                          title={messages.editor.commands.codeBlock}
                          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
                        >
                          <Code2 className="h-4 w-4" />
                        </ToolbarButton>
                      </div>
                    )}

                    <ToolbarDivider />

                    <div className="flex flex-wrap items-center gap-0.5">
                      <ToolbarButton
                        disabled={isToolbarDisabled}
                        title={messages.editor.commands.image}
                        onClick={() => {
                          void handlePickAndInsertImage()
                        }}
                      >
                        <ImagePlus className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        disabled={isToolbarDisabled}
                        title={messages.editor.commands.file}
                        onClick={() => {
                          void handlePickAndInsertFile()
                        }}
                      >
                        <Paperclip className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        disabled={isToolbarDisabled}
                        title={messages.editor.noteLinks.slashLabel}
                        onClick={handleOpenNoteLinkPickerFromToolbar}
                      >
                        <Link2 className="h-4 w-4" />
                      </ToolbarButton>
                      {!isFocusMode ? (
                        <ToolbarButton
                          active={isTocOpen}
                          disabled={isToolbarDisabled}
                          title={messages.editor.commands.toc}
                          onClick={() => handleToggleTocPanel()}
                        >
                          <ListTree className="h-4 w-4" />
                        </ToolbarButton>
                      ) : null}
                      <Button
                        className="h-7 rounded-md border-[#e7ebf1] bg-white px-2.5 text-[12px] font-medium text-[#7c3aed] hover:bg-[#faf5ff] hover:text-[#6d28d9] dark:border-[#243041] dark:bg-[#111827] dark:text-[#c4b5fd] dark:hover:bg-[#1e1b4b]"
                        disabled={isToolbarDisabled || !hasEnabledModel || aiWriteState !== null}
                        size="sm"
                        title={!hasEnabledModel ? messages.editor.aiWrite.disabledHint : messages.editor.aiWrite.slashDescription}
                        variant="outline"
                        onClick={handleToolbarAiWrite}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {messages.editor.aiWrite.slashLabel}
                      </Button>
                    </div>

                    {isTableEditingActive ? (
                      <div className="mt-2 w-full border-t border-[#eef2f7] pt-2 dark:border-[#1f2937]">
                        <div ref={tableMenuRef} className="flex max-w-full flex-wrap items-center gap-0.5">
                          <div className="relative">
                            <ToolbarButton
                              active={activeTableMenu === "column"}
                              disabled={isToolbarDisabled}
                              title={messages.editor.tableControls.columnMenu}
                              onClick={() => {
                                setActiveTableMenu((current) => (current === "column" ? null : "column"))
                              }}
                            >
                              <TableColumnsSplit className="h-4 w-4" />
                            </ToolbarButton>

                            {activeTableMenu === "column" ? (
                              <div className="absolute left-0 top-[calc(100%+0.45rem)] z-30 w-[220px] rounded-2xl border border-[#e7ebf1] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.12)] dark:border-[#243041] dark:bg-[#111827]">
                                <MenuItemButton
                                  onClick={() => {
                                    editor?.chain().focus().addColumnBefore().run()
                                    setActiveTableMenu(null)
                                  }}
                                >
                                  <span>{messages.editor.tableControls.insertColumnBefore}</span>
                                </MenuItemButton>
                                <MenuItemButton
                                  onClick={() => {
                                    editor?.chain().focus().addColumnAfter().run()
                                    setActiveTableMenu(null)
                                  }}
                                >
                                  <span>{messages.editor.tableControls.insertColumnAfter}</span>
                                </MenuItemButton>
                                <MenuItemButton
                                  className={!canDeleteCurrentColumn ? "pointer-events-none opacity-50" : undefined}
                                  onClick={() => {
                                    editor?.chain().focus().deleteColumn().run()
                                    setActiveTableMenu(null)
                                  }}
                                >
                                  <span>{messages.editor.tableControls.deleteColumn}</span>
                                </MenuItemButton>
                                <MenuItemButton onClick={handleToggleTableIndexColumn}>
                                  <span>
                                    {isTableIndexColumnEnabled
                                      ? messages.editor.tableControls.disableIndexColumn
                                      : messages.editor.tableControls.enableIndexColumn}
                                  </span>
                                </MenuItemButton>
                              </div>
                            ) : null}
                          </div>

                          <div className="relative">
                            <ToolbarButton
                              active={activeTableMenu === "row"}
                              disabled={isToolbarDisabled}
                              title={messages.editor.tableControls.rowMenu}
                              onClick={() => {
                                setActiveTableMenu((current) => (current === "row" ? null : "row"))
                              }}
                            >
                              <TableRowsSplit className="h-4 w-4" />
                            </ToolbarButton>

                            {activeTableMenu === "row" ? (
                              <div className="absolute left-0 top-[calc(100%+0.45rem)] z-30 w-[220px] rounded-2xl border border-[#e7ebf1] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.12)] dark:border-[#243041] dark:bg-[#111827]">
                                <MenuItemButton
                                  onClick={() => {
                                    editor?.chain().focus().addRowBefore().run()
                                    setActiveTableMenu(null)
                                  }}
                                >
                                  <span>{messages.editor.tableControls.insertRowAbove}</span>
                                </MenuItemButton>
                                <MenuItemButton
                                  onClick={() => {
                                    editor?.chain().focus().addRowAfter().run()
                                    setActiveTableMenu(null)
                                  }}
                                >
                                  <span>{messages.editor.tableControls.insertRowBelow}</span>
                                </MenuItemButton>
                                <MenuItemButton
                                  className={!canDeleteCurrentRow ? "pointer-events-none opacity-50" : undefined}
                                  onClick={() => {
                                    editor?.chain().focus().deleteRow().run()
                                    setActiveTableMenu(null)
                                  }}
                                >
                                  <span>{messages.editor.tableControls.deleteRow}</span>
                                </MenuItemButton>
                              </div>
                            ) : null}
                          </div>

                          <div className="relative">
                            <ToolbarButton
                              active={activeTableMenu === "cell"}
                              disabled={isToolbarDisabled}
                              title={messages.editor.tableControls.cellMenu}
                              onClick={() => {
                                setActiveTableMenu((current) => (current === "cell" ? null : "cell"))
                              }}
                            >
                              <TableCellsMerge className="h-4 w-4" />
                            </ToolbarButton>

                            {activeTableMenu === "cell" ? (
                              <div className="absolute left-0 top-[calc(100%+0.45rem)] z-30 w-[220px] rounded-2xl border border-[#e7ebf1] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.12)] dark:border-[#243041] dark:bg-[#111827]">
                                <MenuItemButton
                                  className={!canMergeCells ? "pointer-events-none opacity-50" : undefined}
                                  onClick={() => {
                                    editor?.chain().focus().mergeCells().run()
                                    setActiveTableMenu(null)
                                  }}
                                >
                                  <span>{messages.editor.tableControls.mergeCells}</span>
                                </MenuItemButton>
                                <MenuItemButton
                                  className={!canSplitCell ? "pointer-events-none opacity-50" : undefined}
                                  onClick={() => {
                                    editor?.chain().focus().splitCell().run()
                                    setActiveTableMenu(null)
                                  }}
                                >
                                  <span>{messages.editor.tableControls.splitCell}</span>
                                </MenuItemButton>
                              </div>
                            ) : null}
                          </div>

                          <div className="relative">
                            <ToolbarButton
                              active={activeTableMenu === "header"}
                              disabled={isToolbarDisabled}
                              title={messages.editor.tableControls.headerMenu}
                              onClick={() => {
                                setActiveTableMenu((current) => (current === "header" ? null : "header"))
                              }}
                            >
                              <PanelTop className="h-4 w-4" />
                            </ToolbarButton>

                            {activeTableMenu === "header" ? (
                              <div className="absolute left-0 top-[calc(100%+0.45rem)] z-30 w-[220px] rounded-2xl border border-[#e7ebf1] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.12)] dark:border-[#243041] dark:bg-[#111827]">
                                <MenuItemButton
                                  className={!canToggleHeaderRow ? "pointer-events-none opacity-50" : undefined}
                                  onClick={() => {
                                    editor?.chain().focus().toggleHeaderRow().run()
                                    setActiveTableMenu(null)
                                  }}
                                >
                                  <span>{messages.editor.tableControls.toggleHeaderRow}</span>
                                </MenuItemButton>
                                <MenuItemButton
                                  className={!canToggleHeaderColumn ? "pointer-events-none opacity-50" : undefined}
                                  onClick={() => {
                                    editor?.chain().focus().toggleHeaderColumn().run()
                                    setActiveTableMenu(null)
                                  }}
                                >
                                  <span>{messages.editor.tableControls.toggleHeaderColumn}</span>
                                </MenuItemButton>
                              </div>
                            ) : null}
                          </div>

                          <span className="mx-1 h-4 w-px bg-[#e7ebf1] dark:bg-[#243041]" />

                          <div className="relative">
                            <ToolbarButton
                              active={activeTableMenu === "danger"}
                              disabled={isToolbarDisabled}
                              title={messages.editor.tableControls.dangerMenu}
                              tone="danger"
                              onClick={() => {
                                setActiveTableMenu((current) => (current === "danger" ? null : "danger"))
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </ToolbarButton>

                            {activeTableMenu === "danger" ? (
                              <div className="absolute right-0 top-[calc(100%+0.45rem)] z-30 w-[220px] rounded-2xl border border-[#e7ebf1] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.12)] dark:border-[#243041] dark:bg-[#111827]">
                                <MenuItemButton
                                  className="text-[#b42318] hover:bg-[rgba(180,35,24,0.06)] hover:text-[#b42318] dark:text-[#fda29b] dark:hover:bg-[#261318] dark:hover:text-[#fda29b]"
                                  onClick={() => {
                                    editor?.chain().focus().deleteTable().run()
                                    setActiveTableMenu(null)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 shrink-0" />
                                  <span>{messages.editor.tableControls.deleteTable}</span>
                                </MenuItemButton>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="min-h-0 flex-1 xl:flex xl:items-start xl:gap-6">
                <div className="relative min-h-[560px] min-w-0 flex-1" ref={editorSurfaceRef}>
                  <TocPanel
                    activePos={activeTocPos}
                    collapseLabel={messages.editor.toc.collapse}
                    emptyLabel={messages.editor.toc.empty}
                    expandLabel={messages.editor.toc.expand}
                    items={tocItems}
                    open={isTocOpen}
                    title={messages.editor.toc.title}
                    onOpenChange={setIsTocOpen}
                    onSelect={handleSelectTocItem}
                  />
                  {editor && isEditing && !isVersionPreviewing ? (
                    <TiptapDragHandle className="metis-drag-handle" editor={editor} tippyOptions={dragHandleTippyOptions}>
                      <span className="metis-drag-handle-visual">
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                    </TiptapDragHandle>
                  ) : null}

                  <EditorContent editor={editor} />

                  {tableInsertPicker?.source === "slash" && tableInsertPicker.position ? (
                    <div
                      ref={tableInsertPickerRef}
                      className="absolute z-30"
                      style={{
                        top: tableInsertPicker.position.top,
                        left: tableInsertPicker.position.left,
                      }}
                    >
                      <TableInsertPicker
                        messages={messages.editor.tablePicker}
                        rows={tableInsertPicker.rows}
                        cols={tableInsertPicker.cols}
                        onClose={() => closeTableInsertPicker(true)}
                        onHoverSize={(rows, cols) => {
                          setTableInsertPicker((current) =>
                            current
                              ? {
                                  ...current,
                                  rows,
                                  cols,
                                }
                              : current,
                          )
                        }}
                        onSelectSize={handleSelectTableSize}
                      />
                    </div>
                  ) : null}

                  {slashCommand && visibleSlashCommands.length > 0 ? (
                    <div
                      ref={slashMenuRef}
                      className="editor-floating-menu absolute z-30 w-[280px] rounded-2xl border border-[#e7ebf1] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.12)] dark:border-[#243041] dark:bg-[#111827]"
                      style={{
                        top: slashCommand.position.top,
                        left: slashCommand.position.left,
                      }}
                    >
                      {visibleSlashCommands.map((command, index) => {
                        const previousGroup = index > 0 ? visibleSlashCommands[index - 1]?.group : null

                        return (
                          <Fragment key={command.id}>
                            {previousGroup !== command.group ? (
                              <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#98a2b3]">
                                {command.group}
                              </div>
                            ) : null}
                            <button
                              type="button"
                              className={cn(
                                "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition",
                                index === slashCommand.selectedIndex ? "bg-[#f5f3ff]" : "hover:bg-[#f8fafc]",
                                command.disabled && "cursor-not-allowed opacity-70",
                              )}
                              onMouseDown={(event) => {
                                event.preventDefault()
                              }}
                              onMouseEnter={() => {
                                setSlashCommand((current) =>
                                  current
                                    ? {
                                        ...current,
                                        selectedIndex: index,
                                      }
                                    : current,
                                )
                              }}
                              onClick={() => {
                                if (command.disabled) {
                                  return
                                }

                                handleRunSlashCommand(command.id)
                              }}
                            >
                              <span
                                className={cn(
                                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                                  getSlashCommandIconClassName(command.icon),
                                )}
                              >
                                <SlashCommandIcon icon={command.icon} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-[#1f3045]">{command.label}</span>
                                <span className="mt-1 block text-xs leading-5 text-[#667085]">
                                  {command.disabled ? command.hint : command.description}
                                </span>
                              </span>
                            </button>
                          </Fragment>
                        )
                      })}
                    </div>
                  ) : null}

                  {noteLinkPicker ? (
                  <div ref={noteLinkPickerRef}>
                    <NoteLinkPicker
                      emptyLabel={messages.editor.noteLinks.emptyLabel}
                      items={noteLinkPickerItems}
                      position={noteLinkPicker.position}
                      query={noteLinkPicker.query}
                      searchPlaceholder={messages.editor.noteLinks.searchPlaceholder}
                      selectedIndex={noteLinkPicker.selectedIndex}
                      onClose={() => closeNoteLinkPicker(true)}
                      onQueryChange={(value) => {
                        const current = noteLinkPickerStateRef.current

                        if (!current) {
                          return
                        }

                        setNoteLinkPickerState({
                          ...current,
                          query: value,
                          selectedIndex: 0,
                        })
                      }}
                      onSelect={handleSelectNoteLink}
                      onSelectIndex={(index) => {
                        const current = noteLinkPickerStateRef.current

                        if (!current || index === current.selectedIndex) {
                          return
                        }

                        setNoteLinkPickerState({
                          ...current,
                          selectedIndex: index,
                        })
                      }}
                    />
                  </div>
                  ) : null}

                  {aiWriteState ? (
                  <AiWritePanel
                    errorMessage={aiWriteState.errorMessage}
                    messages={messages.editor.aiWrite}
                    position={aiWriteState.position}
                    promptValue={aiWriteState.userInstruction}
                    status={aiWriteState.status}
                    text={aiWriteState.generatedText}
                    onCancel={handleCancelAiWrite}
                    onConfirm={handleConfirmAiWrite}
                    onPromptChange={handleAiWritePromptChange}
                    onPromptSubmit={handleSubmitAiWritePrompt}
                    onRetry={handleRetryAiWrite}
                  />
                  ) : null}
                </div>

                {!isFocusMode ? (
                  <VersionHistoryPanel
                    open={isVersionPanelOpen}
                    isLoading={isLoadingVersions}
                    restoringTimestamp={isRestoringVersion ? selectedVersionTimestamp : null}
                    items={versionHistoryItems}
                    selectedTimestamp={selectedVersionTimestamp}
                    title={messages.editor.versionHistory.title}
                    loadingLabel={messages.editor.versionHistory.loading}
                    emptyLabel={messages.editor.versionHistory.empty}
                    currentLabel={messages.editor.versionHistory.current}
                    previewLabel={messages.editor.versionHistory.preview}
                    restoreLabel={messages.editor.versionHistory.restore}
                    closeLabel={messages.editor.versionHistory.close}
                    onOpenChange={handleToggleVersionPanel}
                    onSelect={(timestamp) => {
                      void handleSelectVersion(timestamp)
                    }}
                    onRestore={(timestamp) => {
                      void handleRestoreVersionAction(timestamp)
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[460px] flex-col items-center justify-center px-8 text-center">
            <h2 className="text-[48px] font-semibold tracking-tight text-foreground">{messages.editor.emptyTitle}</h2>
            <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#8d95a2] dark:text-slate-500">{messages.editor.emptyDescription}</p>
          </div>
        )}
      </div>

      {lightboxImage ? (
        <ImageLightbox
          alt={lightboxImage.alt}
          closeLabel={messages.editor.assets.closeLightbox}
          open={Boolean(lightboxImage)}
          src={lightboxImage.src}
          onOpenChange={(open) => {
            if (!open) {
              setLightboxImage(null)
            }
          }}
        />
      ) : null}
    </section>
  )
}
