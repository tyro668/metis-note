import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from "react"
import { ChevronDown, ChevronRight, Download, FileText, LayoutTemplate, ListTree, Plus, RotateCcw, Search, Star, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/provider"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { NoteSummary, NoteView } from "@/shared/notes"

interface NoteListProps {
  notes: NoteSummary[]
  selectedNoteId: string | null
  searchValue: string
  activeView: NoteView
  isLoading: boolean
  noticeMessage: string | null
  searchInputRef: RefObject<HTMLInputElement>
  onSearchChange: (value: string) => void
  onImportNote: () => void
  onCreateNote: () => void
  onCreateFromTemplate: () => void
  onSelectNote: (id: string, mode: "preview" | "edit") => void
  onTogglePin: (id: string) => void
  onMoveToTrash: (id: string) => void
  onRestoreNote: (id: string) => void
  onDeleteForever: (id: string) => void
}

interface TreeNode {
  note: NoteSummary
  children: TreeNode[]
}

function compareTreeNotes(left: NoteSummary, right: NoteSummary, view: NoteView) {
  if (view !== "trash" && left.isPinned !== right.isPinned) {
    return left.isPinned ? -1 : 1
  }

  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
}

function buildNoteTree(notes: NoteSummary[], view: NoteView) {
  const byId = new Map<string, TreeNode>()

  for (const note of notes) {
    byId.set(note.id, {
      note,
      children: [],
    })
  }

  const roots: TreeNode[] = []

  for (const note of notes) {
    const node = byId.get(note.id)

    if (!node) {
      continue
    }

    if (note.parentId && byId.has(note.parentId)) {
      byId.get(note.parentId)?.children.push(node)
      continue
    }

    roots.push(node)
  }

  const sortBranch = (branch: TreeNode[]) => {
    branch.sort((left, right) => compareTreeNotes(left.note, right.note, view))
    branch.forEach((node) => sortBranch(node.children))
  }

  sortBranch(roots)

  return roots
}

function collectAncestorIds(notes: NoteSummary[], noteId: string | null) {
  if (!noteId) {
    return []
  }

  const byId = new Map(notes.map((note) => [note.id, note]))
  const ancestors: string[] = []
  const visited = new Set<string>()
  let currentId = byId.get(noteId)?.parentId ?? null

  while (currentId && byId.has(currentId) && !visited.has(currentId)) {
    ancestors.push(currentId)
    visited.add(currentId)
    currentId = byId.get(currentId)?.parentId ?? null
  }

  return ancestors
}

function TreeNodeActionButton({
  title,
  className,
  onClick,
  children,
}: {
  title: string
  className?: string
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      className={cn("rounded-md p-1.5 text-[#9aa2af] transition hover:bg-white hover:text-foreground dark:text-slate-500 dark:hover:bg-[#1e293b]", className)}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function NoteList({
  notes,
  selectedNoteId,
  searchValue,
  activeView,
  isLoading,
  noticeMessage,
  searchInputRef,
  onSearchChange,
  onImportNote,
  onCreateNote,
  onCreateFromTemplate,
  onSelectNote,
  onTogglePin,
  onMoveToTrash,
  onRestoreNote,
  onDeleteForever,
}: NoteListProps) {
  const { messages } = useI18n()
  const emptyMessage =
    activeView === "favorites"
      ? messages.tree.emptyFavorites
      : activeView === "trash"
        ? messages.tree.emptyTrash
        : messages.tree.emptyAll
  const tree = useMemo(() => buildNoteTree(notes, activeView), [notes, activeView])
  const pinnedRoots = useMemo(() => (activeView === "all" ? tree.filter((node) => node.note.isPinned) : []), [activeView, tree])
  const regularRoots = useMemo(
    () => (activeView === "all" ? tree.filter((node) => !node.note.isPinned) : tree),
    [activeView, tree],
  )
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({})
  const clickTimerRef = useRef<number | null>(null)
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false)
  const importMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const ancestorIds = collectAncestorIds(notes, selectedNoteId)

    if (ancestorIds.length === 0) {
      return
    }

    setCollapsedIds((current) => {
      let changed = false
      const next = { ...current }

      for (const id of ancestorIds) {
        if (next[id]) {
          next[id] = false
          changed = true
        }
      }

      return changed ? next : current
    })
  }, [notes, selectedNoteId])

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isImportMenuOpen) {
      return
    }

    function handlePointerDown(event: globalThis.MouseEvent) {
      if (!(event.target instanceof Node) || importMenuRef.current?.contains(event.target)) {
        return
      }

      setIsImportMenuOpen(false)
    }

    window.addEventListener("mousedown", handlePointerDown)
    return () => window.removeEventListener("mousedown", handlePointerDown)
  }, [isImportMenuOpen])

  function schedulePreviewOpen(id: string) {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current)
    }

    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null
      onSelectNote(id, "preview")
    }, 180)
  }

  function openInEditMode(id: string) {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }

    onSelectNote(id, "edit")
  }

  function renderNode(node: TreeNode, depth: number): ReactNode {
    const hasChildren = node.children.length > 0
    const isCollapsed = searchValue.trim() ? false : collapsedIds[node.note.id] ?? false
    const isActive = node.note.id === selectedNoteId

    return (
      <div key={node.note.id}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-lg pr-2 transition",
            isActive
              ? "bg-[#eff4ff] text-[#1d4ed8] dark:bg-[#13233f] dark:text-[#8eb8ff]"
              : "hover:bg-[#f8fafc] dark:hover:bg-[#111827]",
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <button
            type="button"
            disabled={!hasChildren}
            className="inline-flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-[#98a2b3] transition disabled:opacity-40 dark:text-slate-500"
            onClick={() =>
              setCollapsedIds((current) => ({
                ...current,
                [node.note.id]: !isCollapsed,
              }))
            }
          >
            {hasChildren ? (
              <ChevronRight className={cn("h-4 w-4 transition", !isCollapsed && "rotate-90")} />
            ) : (
              <span className="h-4 w-4" />
            )}
          </button>

          <span
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
              isActive ? "bg-white text-[#4a7cff] dark:bg-[#0f172a]" : "text-[#9aa2af] dark:text-slate-500",
            )}
          >
            <FileText className="h-3.5 w-3.5" />
          </span>

          <button
            type="button"
            className={cn(
              "min-w-0 flex-1 truncate rounded-md py-1.5 text-left text-[13px] font-medium transition",
              isActive ? "text-[#1d4ed8] dark:text-[#8eb8ff]" : "text-[#344054] dark:text-slate-200",
            )}
            onClick={() => schedulePreviewOpen(node.note.id)}
            onDoubleClick={() => openInEditMode(node.note.id)}
          >
            {node.note.title}
          </button>

          <div className="flex shrink-0 items-center gap-1">
            {node.note.status === "trashed" ? (
              <>
                <TreeNodeActionButton
                  title={messages.tree.restoreTitle}
                  className="opacity-70 hover:opacity-100"
                  onClick={() => onRestoreNote(node.note.id)}
                >
                  <RotateCcw className="h-4 w-4" />
                </TreeNodeActionButton>
                <TreeNodeActionButton
                  title={messages.tree.deleteForeverTitle}
                  className="opacity-70 hover:opacity-100"
                  onClick={() => onDeleteForever(node.note.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </TreeNodeActionButton>
              </>
            ) : (
              <>
                <TreeNodeActionButton
                    title={node.note.isPinned ? messages.tree.unpinTitle : messages.tree.pinTitle}
                    className={cn(
                      node.note.isPinned
                        ? "bg-[#fff6d8] text-[#e0ac12] dark:bg-[#3a2e10] dark:text-[#facc15]"
                        : "opacity-0 group-hover:opacity-100",
                    )}
                  onClick={() => onTogglePin(node.note.id)}
                >
                  <Star className={cn("h-4 w-4", node.note.isPinned && "fill-current")} />
                </TreeNodeActionButton>
                <TreeNodeActionButton
                  title={messages.tree.moveToTrashTitle}
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => onMoveToTrash(node.note.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </TreeNodeActionButton>
              </>
            )}
          </div>
        </div>

        {!isCollapsed && hasChildren ? <div>{node.children.map((child) => renderNode(child, depth + 1))}</div> : null}
      </div>
    )
  }

  function renderSection(title: string, icon: ReactNode, nodes: TreeNode[]) {
    if (nodes.length === 0) {
      return null
    }

    return (
      <section className="space-y-1.5">
        <div className="flex items-center gap-2 px-3 text-[12px] font-medium text-[#8d95a2] dark:text-slate-500">
          <span className="inline-flex h-4 w-4 items-center justify-center">{icon}</span>
          <span>{title}</span>
        </div>
        <div className="space-y-1">{nodes.map((node) => renderNode(node, 0))}</div>
      </section>
    )
  }

  return (
    <aside className="note-list flex w-full shrink-0 flex-col overflow-hidden border-t border-[#edf1f7] bg-[#fbfdff] dark:border-[#1f2937] dark:bg-[#0b1220] xl:w-[304px] xl:border-r xl:border-t-0">
      <div className="border-b border-[#eef2f7] px-4 pb-4 pt-3.5 dark:border-[#1f2937]">
        <div className="space-y-3">
          <div className="flex shrink-0 items-center gap-2">
            <Button
              className="h-9 w-full rounded-lg border-0 bg-[#67c3ca] px-4 text-sm font-medium text-white shadow-none hover:-translate-y-0 hover:bg-[#5ab5bd]"
              onClick={onCreateNote}
            >
              <Plus className="h-4 w-4" />
              {messages.tree.createButton}
            </Button>
            <div className="relative" ref={importMenuRef}>
              <Button
                variant="outline"
                className="h-9 rounded-lg border-[#e7ebf1] px-3 text-sm font-medium text-[#667085] shadow-none hover:bg-[#f6f8fb] dark:border-[#243041] dark:bg-[#0f172a] dark:text-slate-300 dark:hover:bg-[#111827]"
                onClick={() => setIsImportMenuOpen((current) => !current)}
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">{messages.tree.importMenuButton}</span>
                <ChevronDown className={cn("h-4 w-4 transition", isImportMenuOpen && "rotate-180")} />
              </Button>

              {isImportMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+0.45rem)] z-20 w-48 rounded-xl border border-[#e7ebf1] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.12)] dark:border-[#243041] dark:bg-[#0f172a]">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-[#344054] transition hover:bg-[#f6f8fb] dark:text-slate-200 dark:hover:bg-[#111827]"
                    onClick={() => {
                      setIsImportMenuOpen(false)
                      onCreateFromTemplate()
                    }}
                  >
                    <LayoutTemplate className="h-4 w-4 shrink-0" />
                    <span>{messages.tree.createFromTemplateButton}</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-[#344054] transition hover:bg-[#f6f8fb] dark:text-slate-200 dark:hover:bg-[#111827]"
                    onClick={() => {
                      setIsImportMenuOpen(false)
                      onImportNote()
                    }}
                  >
                    <Download className="h-4 w-4 shrink-0" />
                    <span>{messages.tree.importButton}</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a1a8b3] dark:text-slate-500" />
          <Input
            ref={searchInputRef}
            className="h-8 rounded-lg border-[#e7ebf1] bg-white pl-8 text-[13px] shadow-none dark:border-[#243041] dark:bg-[#0f172a] dark:text-slate-100"
            placeholder={messages.tree.searchPlaceholder}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          </div>
        </div>

        {noticeMessage ? <p className="mt-3 text-sm text-[#6480b7] dark:text-[#93c5fd]">{noticeMessage}</p> : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {isLoading ? (
          <div className="px-4 py-8 text-sm text-muted-foreground">{messages.tree.loading}</div>
        ) : notes.length === 0 ? (
          <div className="px-4 py-10 text-sm leading-7 text-muted-foreground">
            {searchValue.trim() ? messages.tree.noResults : emptyMessage}
          </div>
        ) : (
          <div className="space-y-4 px-3 py-4">
            {activeView === "all" ? (
              <>
                {renderSection(messages.tree.pinnedTitle, <Star className="h-3.5 w-3.5" />, pinnedRoots)}
                {renderSection(messages.tree.titleAll, <ListTree className="h-3.5 w-3.5" />, regularRoots)}
              </>
            ) : (
              renderSection(
                activeView === "favorites" ? messages.tree.titleFavorites : activeView === "trash" ? messages.tree.titleTrash : messages.tree.titleAll,
                activeView === "favorites" ? <Star className="h-3.5 w-3.5" /> : <ListTree className="h-3.5 w-3.5" />,
                regularRoots,
              )
            )}
          </div>
        )}
      </ScrollArea>
    </aside>
  )
}
