import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react"
import type { JSONContent } from "@tiptap/core"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import Table from "@tiptap/extension-table"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import TableRow from "@tiptap/extension-table-row"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import {
  Bold,
  ChevronDown,
  Download,
  FileText,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Link2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { AiWritePanel, type AiWritePanelPosition, type AiWritePanelStatus } from "@/components/editor/ai-write-panel"
import {
  buildAiWriteInsertContent,
  buildAiWriteUserPrompt,
  collectAiWriteContext,
  getAiWriteSystemPrompt,
} from "@/components/editor/ai-write"
import { NoteLink, NoteLinkRenderStore } from "@/components/editor/note-link"
import { NoteLinkPicker, type NoteLinkPickerItem } from "@/components/editor/note-link-picker"
import { getNoteLinkTriggerMatch, getSlashCommandMatch, matchesSlashCommandQuery } from "@/components/editor/slash-command"
import { NoteBacklinks } from "@/components/note-backlinks"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/provider"
import { cn } from "@/lib/utils"
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
import type { AppLocale } from "@/shared/i18n"

interface NoteEditorProps {
  note: NoteDocument | null
  allNotes: NoteSummary[]
  pathTitles: string[]
  requestedMode: "preview" | "edit"
  modeRequestId: number
  isLoading: boolean
  isSaving: boolean
  lastSavedAt: string | null
  errorMessage: string | null
  onTitleChange: (title: string) => void
  onTagsChange: (tags: string[]) => void
  onContentChange: (content: JSONContent, plainText: string) => void
  onMoveToTrash: () => void
  onDeleteForever: () => void
  onExportNote: () => void
  onCommitEdits: () => Promise<void> | void
  onOpenLinkedNote: (noteId: string) => void
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
  id: "ai-write" | "note-link"
  label: string
  description: string
  disabled: boolean
  hint: string | null
  keywords: string[]
  icon: "sparkles" | "link"
}

interface AiWriteState {
  requestId: string
  streamId: string | null
  insertPosition: number
  position: AiWritePanelPosition
  status: AiWritePanelStatus
  generatedText: string
  errorMessage: string | null
  request: LlmStreamChatParams
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

function clampOverlayPosition(value: number, width: number, overlayWidth: number) {
  const maxLeft = Math.max(12, width - overlayWidth - 12)

  return Math.min(Math.max(12, value), maxLeft)
}

interface ToolbarButtonProps {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

function ToolbarButton({ active, disabled, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#7f8794] transition hover:text-foreground",
        active ? "bg-white text-[#2d3644] shadow-sm" : "hover:bg-white",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
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
      className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-[#f8fafc]", className)}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function MetaPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-[#e7ebf1] bg-[#fbfcfe] px-3 py-1.5 text-[13px] font-medium text-[#667085]">
      {children}
    </span>
  )
}

function TagPill({
  tag,
  removable,
  onRemove,
}: {
  tag: string
  removable?: boolean
  onRemove?: () => void
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-lg border border-[#e7ebf1] bg-[#fbfcfe] px-3 py-1.5 text-[13px] font-medium text-[#667085]", removable && "pr-1.5")}>
      <span>{tag}</span>
      {removable ? (
        <button
          type="button"
          className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-md text-[#98a2b3] transition hover:bg-white hover:text-foreground"
          onClick={onRemove}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  )
}

export function NoteEditor({
  note,
  allNotes,
  pathTitles,
  requestedMode,
  modeRequestId,
  isLoading,
  isSaving,
  lastSavedAt,
  errorMessage,
  onTitleChange,
  onTagsChange,
  onContentChange,
  onMoveToTrash,
  onDeleteForever,
  onExportNote,
  onCommitEdits,
  onOpenLinkedNote,
}: NoteEditorProps) {
  const { locale, messages } = useI18n()
  const [isEditing, setIsEditing] = useState(false)
  const [isTitleEditing, setIsTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(note?.title ?? "")
  const [tagDraft, setTagDraft] = useState("")
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const [hasEnabledModel, setHasEnabledModel] = useState(false)
  const [slashCommand, setSlashCommand] = useState<SlashCommandState | null>(null)
  const [aiWriteState, setAiWriteState] = useState<AiWriteState | null>(null)
  const [noteLinkPicker, setNoteLinkPicker] = useState<NoteLinkPickerState | null>(null)
  const [backlinks, setBacklinks] = useState<NoteSummary[]>([])
  const menuRef = useRef<HTMLDivElement>(null)
  const slashMenuRef = useRef<HTMLDivElement>(null)
  const noteLinkPickerRef = useRef<HTMLDivElement>(null)
  const editorSurfaceRef = useRef<HTMLDivElement>(null)
  const slashCommandRef = useRef<SlashCommandState | null>(null)
  const aiWriteStateRef = useRef<AiWriteState | null>(null)
  const noteLinkPickerStateRef = useRef<NoteLinkPickerState | null>(null)
  const slashCommandsRef = useRef<SlashCommandItem[]>([])
  const currentNoteLinkIdsRef = useRef<string[]>([])
  const noteLinkResolutionRequestRef = useRef(0)
  const noteLinkRenderStoreRef = useRef(new NoteLinkRenderStore())
  const notePathLabelsRef = useRef<Map<string, string | null>>(new Map())
  const openLinkedNoteRef = useRef(onOpenLinkedNote)
  const confirmAiWriteRef = useRef<() => void>(() => undefined)
  const cancelAiWriteRef = useRef<() => void>(() => undefined)
  const retryAiWriteRef = useRef<() => void>(() => undefined)
  const runSelectedSlashCommandRef = useRef<() => void>(() => undefined)
  const canEditNote = note?.status === "active"
  const isToolbarDisabled = !note || !canEditNote || !isEditing
  const ancestorTitles = pathTitles.slice(0, -1)
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
  const editor = useEditor(
    {
      editable: canEditNote && isEditing,
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3],
          },
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
        Table.configure({
          resizable: false,
          renderWrapper: true,
        }),
        TableRow,
        TableHeader,
        TableCell,
        Placeholder.configure({
          placeholder: messages.editor.contentPlaceholder,
          showOnlyWhenEditable: true,
        }),
      ],
      content: note?.content ?? createEmptyDocument(),
      editorProps: {
        attributes: {
          class: "ProseMirror px-0 py-0 text-[18px] leading-[2.05rem] text-[#344054] focus:outline-none",
        },
        handleKeyDown(_view, event) {
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

          return false
        },
      },
      onUpdate({ editor: currentEditor }) {
        onContentChange(currentEditor.getJSON(), currentEditor.getText())
      },
    },
    [
      canEditNote,
      isEditing,
      messages.editor.contentPlaceholder,
      messages.editor.noteLinks.deletedTooltip,
      messages.editor.noteLinks.modifierHint,
      note?.id,
      note?.status,
    ],
  )

  useEffect(() => {
    setIsEditing(false)
    setIsTitleEditing(false)
    setTitleDraft(note?.title ?? "")
    setTagDraft("")
    setIsMoreMenuOpen(false)
  }, [note?.id, note?.status])

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
    }
  }, [canEditNote, modeRequestId, requestedMode])

  useEffect(() => {
    editor?.setEditable(canEditNote && isEditing)
  }, [canEditNote, editor, isEditing])

  useEffect(() => {
    if (!isEditing || !canEditNote) {
      return
    }

    editor?.chain().focus("end").run()
  }, [canEditNote, editor, isEditing])

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

  const visibleSlashCommands = useMemo(() => {
    if (!slashCommand) {
      return []
    }

    const noteLinkCommand: SlashCommandItem = {
      id: "note-link",
      label: messages.editor.noteLinks.slashLabel,
      description: messages.editor.noteLinks.slashDescription,
      disabled: linkableNotes.length === 0,
      hint: linkableNotes.length === 0 ? messages.editor.noteLinks.disabledHint : null,
      keywords: [messages.editor.noteLinks.slashLabel, "link", "document", "wiki", "链接", "文档"],
      icon: "link",
    }
    const aiWriteCommand: SlashCommandItem = {
      id: "ai-write",
      label: messages.editor.aiWrite.slashLabel,
      description: messages.editor.aiWrite.slashDescription,
      disabled: !hasEnabledModel,
      hint: hasEnabledModel ? null : messages.editor.aiWrite.disabledHint,
      keywords: [messages.editor.aiWrite.slashLabel, "AI", "write", "帮写", "续写"],
      icon: "sparkles",
    }

    return [noteLinkCommand, aiWriteCommand].filter((command) =>
      matchesSlashCommandQuery(slashCommand.query, [command.label, command.description, ...command.keywords]),
    )
  }, [
    hasEnabledModel,
    messages.editor.aiWrite.disabledHint,
    messages.editor.aiWrite.slashDescription,
    messages.editor.aiWrite.slashLabel,
    messages.editor.noteLinks.disabledHint,
    messages.editor.noteLinks.slashDescription,
    messages.editor.noteLinks.slashLabel,
    linkableNotes.length,
    slashCommand,
  ])

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
    if (!canEditNote || !isEditing) {
      setHasEnabledModel(false)
      return
    }

    void refreshEnabledModelAvailability()
  }, [canEditNote, isEditing, note?.id])

  useEffect(() => {
    void resolveCurrentNoteLinks(extractNoteLinkIds(note?.content ?? null))
  }, [note?.content, note?.id, note?.status])

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
      const noteLinkCommand: SlashCommandItem = {
        id: "note-link",
        label: messages.editor.noteLinks.slashLabel,
        description: messages.editor.noteLinks.slashDescription,
        disabled: linkableNotes.length === 0,
        hint: linkableNotes.length === 0 ? messages.editor.noteLinks.disabledHint : null,
        keywords: [messages.editor.noteLinks.slashLabel, "link", "document", "wiki", "链接", "文档"],
        icon: "link",
      }
      const aiWriteCommand: SlashCommandItem = {
        id: "ai-write",
        label: messages.editor.aiWrite.slashLabel,
        description: messages.editor.aiWrite.slashDescription,
        disabled: !hasEnabledModel,
        hint: hasEnabledModel ? null : messages.editor.aiWrite.disabledHint,
        keywords: [messages.editor.aiWrite.slashLabel, "AI", "write", "帮写", "续写"],
        icon: "sparkles",
      }

      return [noteLinkCommand, aiWriteCommand].filter((command) =>
        matchesSlashCommandQuery(query, [command.label, command.description, ...command.keywords]),
      )
    }

    function syncCommands() {
      if (!canEditNote || !isEditing || aiWriteStateRef.current || noteLinkPickerStateRef.current) {
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
    hasEnabledModel,
    isEditing,
    messages.editor.aiWrite.disabledHint,
    messages.editor.aiWrite.slashDescription,
    messages.editor.aiWrite.slashLabel,
    messages.editor.noteLinks.disabledHint,
    messages.editor.noteLinks.slashDescription,
    messages.editor.noteLinks.slashLabel,
    linkableNotes.length,
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
    if (canEditNote && isEditing) {
      return
    }

    const currentAiWriteState = aiWriteStateRef.current

    setSlashCommand(null)
    setNoteLinkPickerState(null)
    setAiWriteState(null)

    if (currentAiWriteState?.streamId) {
      void window.metisNote.llm.cancelStream(currentAiWriteState.streamId).catch(() => undefined)
    }
  }, [canEditNote, isEditing, note?.id])

  useEffect(() => {
    return () => {
      const currentAiWriteState = aiWriteStateRef.current

      if (currentAiWriteState?.streamId) {
        void window.metisNote.llm.cancelStream(currentAiWriteState.streamId).catch(() => undefined)
      }
    }
  }, [])

  async function startAiWriteStream(request: LlmStreamChatParams, insertPosition: number, position: AiWritePanelPosition) {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    setSlashCommand(null)
    setNoteLinkPickerState(null)
    setAiWriteState({
      requestId,
      streamId: null,
      insertPosition,
      position,
      status: "thinking",
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

    if (!currentAiWriteState) {
      return
    }

    const nextPosition = resolveOverlayPosition(currentAiWriteState.insertPosition, 520) ?? currentAiWriteState.position
    void startAiWriteStream(currentAiWriteState.request, currentAiWriteState.insertPosition, nextPosition)
  }

  function triggerAiWriteFromSelection(fallbackPosition: AiWritePanelPosition | null = null) {
    if (!editor || !note || !canEditNote || !isEditing || aiWriteStateRef.current) {
      return
    }

    const insertPosition = editor.state.selection.from
    const context = collectAiWriteContext(editor, note.title, insertPosition)
    const request: LlmStreamChatParams = {
      systemPrompt: getAiWriteSystemPrompt(locale),
      userPrompt: buildAiWriteUserPrompt(locale, context),
    }
    const position =
      resolveOverlayPosition(insertPosition, 520) ??
      fallbackPosition ?? {
        top: 20,
        left: 20,
      }

    void startAiWriteStream(request, insertPosition, position)
  }

  function handleRunAiWrite() {
    const currentSlashCommand = slashCommandRef.current

    if (!editor || !currentSlashCommand) {
      return
    }

    editor.chain().focus().deleteRange(currentSlashCommand.range).run()
    triggerAiWriteFromSelection(currentSlashCommand.position)
  }

  function handleOpenNoteLinkPickerFromSlash() {
    const currentSlashCommand = slashCommandRef.current

    if (!editor || !currentSlashCommand) {
      return
    }

    editor.chain().focus().deleteRange(currentSlashCommand.range).run()
    openNoteLinkPicker({
      from: currentSlashCommand.range.from,
      to: currentSlashCommand.range.from,
    })
  }

  function handleRunSelectedSlashCommand() {
    const currentSlashCommand = slashCommandRef.current
    const command = currentSlashCommand
      ? (slashCommandsRef.current[currentSlashCommand.selectedIndex] ?? slashCommandsRef.current[0])
      : null

    if (!command || command.disabled) {
      return
    }

    if (command.id === "note-link") {
      handleOpenNoteLinkPickerFromSlash()
      return
    }

    handleRunAiWrite()
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

    setSlashCommand(null)
    setNoteLinkPickerState(null)
    editor.chain().focus().run()
    triggerAiWriteFromSelection(resolveOverlayPosition(editor.state.selection.from, 520))
  }

  confirmAiWriteRef.current = handleConfirmAiWrite
  cancelAiWriteRef.current = handleCancelAiWrite
  retryAiWriteRef.current = handleRetryAiWrite
  runSelectedSlashCommandRef.current = handleRunSelectedSlashCommand

  function beginTitleEdit() {
    if (!note || !canEditNote) {
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

  function handleDeleteAction() {
    setIsMoreMenuOpen(false)

    if (note?.status === "trashed") {
      onDeleteForever()
      return
    }

    onMoveToTrash()
  }

  function commitTagDraft() {
    if (!note || !canEditNote) {
      return
    }

    const nextTag = tagDraft.trim()

    if (!nextTag) {
      setTagDraft("")
      return
    }

    onTagsChange([...note.tags, nextTag])
    setTagDraft("")
  }

  function removeTag(tag: string) {
    if (!note || !canEditNote) {
      return
    }

    onTagsChange(note.tags.filter((current) => current !== tag))
  }

  function handleTagDraftKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === "," || event.key === "，") {
      event.preventDefault()
      commitTagDraft()
      return
    }

    if (event.key === "Backspace" && !tagDraft && note?.tags.length) {
      event.preventDefault()
      removeTag(note.tags[note.tags.length - 1] ?? "")
    }
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-white">
      {note ? (
        <div className="border-b border-[#eef2f7] px-6 py-3.5 md:px-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {isTitleEditing && canEditNote ? (
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    autoFocus
                    className="min-w-[220px] flex-1 border-none bg-transparent p-0 text-[22px] font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-[#b5bcc7] md:text-[24px]"
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

                  <div className="flex items-center gap-2">
                    <Button className="h-8 px-3" size="sm" onClick={confirmTitleEdit}>
                      {messages.editor.confirmTitleButton}
                    </Button>
                    <Button className="h-8 px-3" size="sm" variant="ghost" onClick={cancelTitleEdit}>
                      {messages.editor.cancelTitleButton}
                    </Button>
                  </div>
                </div>
              ) : (
                <h1
                  className={cn(
                    "truncate text-[22px] font-semibold tracking-[-0.02em] text-foreground md:text-[24px]",
                    canEditNote && "cursor-text",
                  )}
                  onDoubleClick={beginTitleEdit}
                >
                  {note.title}
                </h1>
              )}

              {ancestorTitles.length > 0 ? (
                <div className="mt-2 flex min-w-0 items-center gap-2 text-sm font-medium text-[#98a2b3]">
                  <FileText className="h-4.5 w-4.5 shrink-0" />
                  <span className="truncate">{ancestorTitles.join(" / ")}</span>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <span className={cn("font-medium", errorMessage ? "text-[#c2410c]" : isSaving ? "text-[#375bd2]" : "text-[#98a2b3]")}>
                  {formatStatusLabel(locale, messages.editor.unsaved, messages.editor.saving, isSaving, errorMessage, lastSavedAt)}
                </span>
                <span className="text-[#d0d5dd]">|</span>
                <span className="text-[#98a2b3]">{messages.editor.wordCount(note.wordCount)}</span>
                {note.visibility === "public" ? <MetaPill>{messages.editor.publicVisibility}</MetaPill> : null}

                {canEditNote ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {note.tags.map((tag) => (
                      <TagPill key={tag} removable tag={tag} onRemove={() => removeTag(tag)} />
                    ))}
                    <input
                      className="h-8 w-[96px] rounded-xl border border-[#e5e7eb] bg-[#fbfcfe] px-3 text-[13px] text-[#475467] outline-none placeholder:text-[#98a2b3] focus:border-[#cbd5e1] sm:w-[120px]"
                      placeholder={messages.editor.tagInputPlaceholder}
                      value={tagDraft}
                      onBlur={commitTagDraft}
                      onChange={(event) => setTagDraft(event.target.value)}
                      onKeyDown={handleTagDraftKeyDown}
                    />
                  </div>
                ) : note.tags.length > 0 ? (
                  note.tags.map((tag) => (
                    <TagPill key={tag} tag={tag} />
                  ))
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {canEditNote ? (
                <Button
                  className="h-9 rounded-xl px-3.5 text-[13px]"
                  variant={isEditing ? "default" : "outline"}
                  onClick={() => {
                    void handlePrimaryAction()
                  }}
                >
                  {isEditing ? messages.editor.updateButton : messages.editor.editButton}
                </Button>
              ) : null}

              <div className="relative" ref={menuRef}>
                <Button
                  className="h-9 rounded-xl px-3.5 text-[13px]"
                  variant="outline"
                  onClick={() => setIsMoreMenuOpen((current) => !current)}
                >
                  {messages.editor.moreButton}
                  <ChevronDown className={cn("h-4 w-4 transition", isMoreMenuOpen && "rotate-180")} />
                </Button>

                {isMoreMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-44 rounded-xl border border-[#e7ebf1] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.12)]">
                    <MenuItemButton onClick={handleExportAction}>
                      <Download className="h-4 w-4 shrink-0" />
                      <span>{messages.editor.exportAction}</span>
                    </MenuItemButton>
                    <MenuItemButton className="text-[#b42318]" onClick={handleDeleteAction}>
                      <Trash2 className="h-4 w-4 shrink-0" />
                      <span>{note.status === "trashed" ? messages.editor.deleteForeverAction : messages.editor.deleteAction}</span>
                    </MenuItemButton>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {isLoading ? (
          <div className="flex h-full min-h-[460px] items-center justify-center px-8 text-center text-sm leading-7 text-muted-foreground">
            {messages.editor.loading}
          </div>
        ) : note ? (
          <div className="mx-auto flex min-h-full w-full max-w-[1140px] flex-col px-8 py-8 md:px-10 md:py-8">
            {note.status === "trashed" ? (
              <div className="mb-6 rounded-xl border border-[rgba(154,52,18,0.16)] bg-[rgba(154,52,18,0.05)] px-4 py-3 text-sm text-[rgba(121,44,18,0.92)]">
                {messages.editor.trashedReadonlyNotice}
              </div>
            ) : null}

            <NoteBacklinks
              collapseLabel={messages.editor.noteLinks.backlinksCollapse}
              expandLabel={messages.editor.noteLinks.backlinksExpand}
              noteId={note.id}
              notes={backlinks}
              summaryLabel={messages.editor.noteLinks.backlinksSummary}
              onOpenNote={onOpenLinkedNote}
            />

            <div className="flex min-h-0 flex-1 flex-col">
              {isEditing ? (
                <div className="sticky top-0 z-20 -mx-8 -mt-8 mb-4 border-b border-[#eef2f7] bg-white/95 px-8 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/88 md:-mx-10 md:px-10">
                  <div className="flex flex-wrap items-center gap-1">
                    <ToolbarButton
                      active={editor?.isActive("heading", { level: 1 })}
                      disabled={isToolbarDisabled}
                      onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                    >
                      <Heading1 className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                      active={editor?.isActive("heading", { level: 2 })}
                      disabled={isToolbarDisabled}
                      onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                    >
                      <Heading2 className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                      active={editor?.isActive("bold")}
                      disabled={isToolbarDisabled}
                      onClick={() => editor?.chain().focus().toggleBold().run()}
                    >
                      <Bold className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                      active={editor?.isActive("italic")}
                      disabled={isToolbarDisabled}
                      onClick={() => editor?.chain().focus().toggleItalic().run()}
                    >
                      <Italic className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                      active={editor?.isActive("bulletList")}
                      disabled={isToolbarDisabled}
                      onClick={() => editor?.chain().focus().toggleBulletList().run()}
                    >
                      <List className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                      active={editor?.isActive("orderedList")}
                      disabled={isToolbarDisabled}
                      onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                    >
                      <ListOrdered className="h-4 w-4" />
                    </ToolbarButton>

                    <div className="mx-1 h-5 w-px bg-[#e7ebf1]" />
                    <Button
                      className="h-9 rounded-lg border-[#e7ebf1] bg-white px-3 text-sm font-medium text-[#7c3aed] hover:bg-[#faf5ff] hover:text-[#6d28d9]"
                      disabled={isToolbarDisabled || !hasEnabledModel || aiWriteState !== null}
                      size="sm"
                      title={!hasEnabledModel ? messages.editor.aiWrite.disabledHint : messages.editor.aiWrite.slashDescription}
                      variant="outline"
                      onClick={handleToolbarAiWrite}
                    >
                      <Sparkles className="h-4 w-4" />
                      {messages.editor.aiWrite.slashLabel}
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="relative min-h-[560px] flex-1" ref={editorSurfaceRef}>
                <EditorContent editor={editor} />

                {slashCommand && visibleSlashCommands.length > 0 ? (
                  <div
                    ref={slashMenuRef}
                    className="absolute z-30 w-[280px] rounded-2xl border border-[#e7ebf1] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.12)]"
                    style={{
                      top: slashCommand.position.top,
                      left: slashCommand.position.left,
                    }}
                  >
                    {visibleSlashCommands.map((command, index) => (
                      <button
                        key={command.id}
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

                          handleRunSelectedSlashCommand()
                        }}
                      >
                        <span
                          className={cn(
                            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                            command.icon === "sparkles"
                              ? "border-[#ede9fe] bg-[#f5f3ff] text-[#7c3aed]"
                              : "border-[#dbe4ff] bg-[#eef4ff] text-[#375bd2]",
                          )}
                        >
                          {command.icon === "sparkles" ? <Sparkles className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-[#1f3045]">{command.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-[#667085]">
                            {command.disabled ? command.hint : command.description}
                          </span>
                        </span>
                      </button>
                    ))}
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
                    status={aiWriteState.status}
                    text={aiWriteState.generatedText}
                    onCancel={handleCancelAiWrite}
                    onConfirm={handleConfirmAiWrite}
                    onRetry={handleRetryAiWrite}
                  />
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[460px] flex-col items-center justify-center px-8 text-center">
            <h2 className="text-[48px] font-semibold tracking-tight text-foreground">{messages.editor.emptyTitle}</h2>
            <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#8d95a2]">{messages.editor.emptyDescription}</p>
          </div>
        )}
      </div>
    </section>
  )
}
