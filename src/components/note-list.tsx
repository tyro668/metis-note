import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react"
import { ChevronRight, Download, Plus, RotateCcw, Search, Star, Trash2 } from "lucide-react"
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
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      className={cn("rounded-lg p-2 text-[#9aa2af] transition hover:bg-white hover:text-foreground", className)}
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
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({})
  const clickTimerRef = useRef<number | null>(null)

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
            "group flex items-center gap-1 rounded-xl pr-2 transition",
            isActive ? "bg-[#eff4ff] text-[#1d4ed8]" : "hover:bg-[#f8fafc]",
          )}
          style={{ paddingLeft: `${depth * 18 + 8}px` }}
        >
          <button
            type="button"
            disabled={!hasChildren}
            className="inline-flex h-9 w-8 shrink-0 items-center justify-center rounded-xl text-[#98a2b3] transition disabled:opacity-40"
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

          <button
            type="button"
            className={cn(
              "min-w-0 flex-1 truncate rounded-xl py-2 text-left text-[14px] font-medium transition",
              isActive ? "text-[#1d4ed8]" : "text-[#344054]",
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
                    node.note.isPinned ? "bg-[#fff6d8] text-[#e0ac12]" : "opacity-0 group-hover:opacity-100",
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

  return (
    <aside className="flex w-full shrink-0 flex-col overflow-hidden border-t border-[#edf1f7] bg-white xl:w-[360px] xl:border-r xl:border-t-0">
      <div className="border-b border-[#eef2f7] px-6 pb-4 pt-5">
        <div className="flex items-center justify-end gap-4">
          <div className="flex shrink-0 items-center gap-2">
            <Button
              className="h-10 rounded-xl px-4 text-sm shadow-none hover:-translate-y-0"
              onClick={onCreateNote}
            >
              <Plus className="h-4 w-4" />
              {messages.tree.createButton}
            </Button>
            <Button
              variant="outline"
              className="h-10 rounded-xl border-[#e7ebf1] px-4 text-sm font-medium text-[#667085] shadow-none hover:bg-[#f6f8fb]"
              onClick={onImportNote}
            >
              <Download className="h-4 w-4" />
              {messages.tree.importButton}
            </Button>
          </div>
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a1a8b3]" />
          <Input
            ref={searchInputRef}
            className="h-10 rounded-xl border-[#e7ebf1] bg-white pl-10 text-sm shadow-none"
            placeholder={messages.tree.searchPlaceholder}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        {noticeMessage ? <p className="mt-3 text-sm text-[#6480b7]">{noticeMessage}</p> : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {isLoading ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">{messages.tree.loading}</div>
        ) : notes.length === 0 ? (
          <div className="px-6 py-10 text-sm leading-7 text-muted-foreground">
            {searchValue.trim() ? messages.tree.noResults : emptyMessage}
          </div>
        ) : (
          <div className="space-y-1 px-4 py-5">{tree.map((node) => renderNode(node, 0))}</div>
        )}
      </ScrollArea>
    </aside>
  )
}
