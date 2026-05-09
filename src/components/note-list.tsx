import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronRight, Download, Ellipsis, FileText, Heart, ListTree, Loader2, Plus, RotateCcw, Search, Star, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useI18n } from "@/i18n/provider"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { NoteSummary, NoteView } from "@/shared/notes"
import type { NoteSyncStateMap } from "@/shared/sync"

interface NoteListProps {
  notes: NoteSummary[]
  selectedNoteId: string | null
  searchValue: string
  activeView: NoteView
  isLoading: boolean
  noticeMessage: string | null
  noteSyncStates: NoteSyncStateMap
  searchInputRef: RefObject<HTMLInputElement>
  onSearchChange: (value: string) => void
  onImportNote: () => void
  onCreateNote: () => void
  onSelectNote: (id: string, mode: "preview" | "edit") => void
  onDeselectNote: () => void
  onTogglePin: (id: string) => void
  onToggleFavorite: (id: string) => void
  onMoveToTrash: (id: string) => void
  onRestoreNote: (id: string) => void
  onDeleteForever: (id: string) => void
  onOpenConflicts: () => void
}

interface TreeNode {
  note: NoteSummary
  children: TreeNode[]
}

const TREE_ROOT_ID = "__metis_note_tree_root__"

function buildNoteTree(notes: NoteSummary[]) {
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

export function NoteList({
  notes,
  selectedNoteId,
  searchValue,
  activeView,
  isLoading,
  noticeMessage,
  noteSyncStates,
  searchInputRef,
  onSearchChange,
  onImportNote,
  onCreateNote,
  onSelectNote,
  onDeselectNote,
  onTogglePin,
  onToggleFavorite,
  onMoveToTrash,
  onRestoreNote,
  onDeleteForever,
  onOpenConflicts,
}: NoteListProps) {
  const { messages } = useI18n()
  const emptyMessage =
    activeView === "favorites"
      ? messages.tree.emptyFavorites
      : activeView === "trash"
        ? messages.tree.emptyTrash
        : messages.tree.emptyAll
  const tree = useMemo(() => buildNoteTree(notes), [notes])
  const pinnedNodes = useMemo(() => {
    if (activeView !== "all") return []
    return notes
      .filter((note) => note.isPinned)
      .map((note) => ({ note, children: [] as TreeNode[] }))
  }, [activeView, notes])
  const regularRoots = useMemo(() => tree, [tree])
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

  function renderDocIcon(noteId: string, isActive: boolean) {
    const syncState = noteSyncStates[noteId]
    const isSynced = !syncState || syncState === "synced"
    const badgeColor = isSynced
      ? ""
      : syncState === "upload-pending"
        ? "bg-amber-500"
        : syncState === "download-pending"
          ? "bg-sky-500"
          : syncState === "conflict"
            ? "bg-rose-500"
            : "bg-sky-500"
    const badgeIcon = isSynced ? (
        <Check className="h-2.5 w-2.5 text-emerald-500" />
      ) : syncState === "upload-pending" ? (
        <ArrowUp className="h-2 w-2" />
      ) : syncState === "download-pending" ? (
        <ArrowDown className="h-2 w-2" />
      ) : syncState === "conflict" ? (
        <AlertTriangle className="h-2 w-2" />
      ) : (
        <Loader2 className="h-2 w-2 animate-spin" />
      )
    const label =
      !syncState || syncState === "synced"
        ? messages.tree.syncState.synced
        : syncState === "upload-pending"
          ? messages.tree.syncState.uploadPending
          : syncState === "download-pending"
            ? messages.tree.syncState.downloadPending
            : syncState === "conflict"
              ? messages.tree.syncState.conflict
              : messages.tree.syncState.syncing

    const iconWrapper = (
      <span
        title={label}
        className={cn(
          "relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          isActive ? "bg-white text-[#4a7cff] dark:bg-[#0f172a]" : "text-[#9aa2af] dark:text-slate-500",
        )}
      >
        <FileText className="h-3.5 w-3.5" />
        {!isSynced && (
          <span className={cn(
            "absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-white ring-[1.5px] ring-white dark:ring-[#0b1220]",
            badgeColor,
          )}>
            {badgeIcon}
          </span>
        )}
      </span>
    )

    if (syncState === "conflict") {
      return (
        <button
          type="button"
          title={label}
          className="shrink-0"
          onClick={(event) => {
            event.stopPropagation()
            onOpenConflicts()
          }}
        >
          {iconWrapper}
        </button>
      )
    }

    return iconWrapper
  }

  function renderTreeRow({
    id,
    label,
    depth,
    icon,
    isActive,
    hasChildren,
    isCollapsed,
    children,
    trailing,
    onClick,
    onDoubleClick,
  }: {
    id: string
    label: string
    depth: number
    icon: ReactNode
    isActive: boolean
    hasChildren: boolean
    isCollapsed: boolean
    children?: ReactNode
    trailing?: ReactNode
    onClick: () => void
    onDoubleClick?: () => void
  }) {
    return (
      <div key={id}>
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
                [id]: !isCollapsed,
              }))
            }
          >
            {hasChildren ? (
              <ChevronRight className={cn("h-4 w-4 transition", !isCollapsed && "rotate-90")} />
            ) : (
              <span className="h-4 w-4" />
            )}
          </button>

          {icon}

          <button
            type="button"
            className={cn(
              "min-w-0 flex-1 truncate rounded-md py-1.5 text-left text-[13px] font-medium transition",
              isActive ? "text-[#1d4ed8] dark:text-[#8eb8ff]" : "text-[#344054] dark:text-slate-200",
            )}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
          >
            {label}
          </button>

          {trailing}
        </div>

        {!isCollapsed && hasChildren ? <div>{children}</div> : null}
      </div>
    )
  }

  function renderNode(node: TreeNode, depth: number): ReactNode {
    const hasChildren = node.children.length > 0
    const isCollapsed = searchValue.trim() ? false : collapsedIds[node.note.id] ?? false
    const isActive = node.note.id === selectedNoteId

    const trailing = (
      <>
        {node.note.isFavorite && (
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-[#f472b6] dark:text-[#f9a8d4]">
            <Heart className="h-3 w-3 fill-current" />
          </span>
        )}

        {node.note.isPinned && (
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-[#e0ac12] dark:text-[#facc15]">
            <Star className="h-3 w-3 fill-current" />
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#9aa2af] transition hover:bg-white hover:text-foreground dark:text-slate-500 dark:hover:bg-[#1e293b]",
                "opacity-0 group-hover:opacity-100",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <Ellipsis className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {node.note.status === "trashed" ? (
              <>
                <DropdownMenuItem onClick={() => onRestoreNote(node.note.id)}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {messages.tree.restoreTitle}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDeleteForever(node.note.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {messages.tree.deleteForeverTitle}
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={() => onTogglePin(node.note.id)}>
                  <Star className={cn("mr-2 h-4 w-4", node.note.isPinned && "fill-current")} />
                  {node.note.isPinned ? messages.tree.unpinTitle : messages.tree.pinTitle}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggleFavorite(node.note.id)}>
                  <Heart className={cn("mr-2 h-4 w-4", node.note.isFavorite && "fill-current")} />
                  {node.note.isFavorite ? messages.tree.unfavoriteTitle : messages.tree.favoriteTitle}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onMoveToTrash(node.note.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {messages.tree.moveToTrashTitle}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    )

    return renderTreeRow({
      id: node.note.id,
      label: node.note.title,
      depth,
      icon: renderDocIcon(node.note.id, isActive),
      isActive,
      hasChildren,
      isCollapsed,
      trailing,
      onClick: () => schedulePreviewOpen(node.note.id),
      onDoubleClick: () => openInEditMode(node.note.id),
      children: node.children.map((child) => renderNode(child, depth + 1)),
    })
  }

  function renderTreeRoot(title: string, icon: ReactNode, nodes: TreeNode[]) {
    if (nodes.length === 0) {
      return null
    }

    const rootId = `${TREE_ROOT_ID}:${activeView}:${title}`
    const isCollapsed = searchValue.trim() ? false : collapsedIds[rootId] ?? false

    return renderTreeRow({
      id: rootId,
      label: title,
      depth: 0,
      icon: (
        <span
          className={cn(
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            selectedNoteId === null ? "bg-white text-[#4a7cff] dark:bg-[#0f172a]" : "text-[#9aa2af] dark:text-slate-500",
          )}
        >
          {icon}
        </span>
      ),
      isActive: selectedNoteId === null,
      hasChildren: nodes.length > 0,
      isCollapsed,
      onClick: onDeselectNote,
      children: nodes.map((node) => renderNode(node, 1)),
    })
  }

  function renderSection(title: string, icon: ReactNode, nodes: TreeNode[]) {
    if (nodes.length === 0) {
      return null
    }

    return (
      <section className="space-y-1.5">
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-3 py-0.5 text-left text-[12px] font-medium transition",
            selectedNoteId === null
              ? "bg-[#eff4ff] text-[#1d4ed8] dark:bg-[#13233f] dark:text-[#8eb8ff]"
              : "text-[#8d95a2] hover:bg-[#f8fafc] dark:text-slate-500 dark:hover:bg-[#111827]",
          )}
          onClick={onDeselectNote}
        >
          <span className="inline-flex h-4 w-4 items-center justify-center">{icon}</span>
          <span>{title}</span>
        </button>
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
            <Button
              variant="outline"
              className="h-9 rounded-lg border-[#e7ebf1] px-3 text-sm font-medium text-[#667085] shadow-none hover:bg-[#f6f8fb] dark:border-[#243041] dark:bg-[#0f172a] dark:text-slate-300 dark:hover:bg-[#111827]"
              onClick={onImportNote}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">{messages.tree.importButton}</span>
            </Button>
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
                {renderSection(messages.tree.pinnedTitle, <Star className="h-3.5 w-3.5" />, pinnedNodes)}
                {renderTreeRoot(messages.tree.titleAll, <ListTree className="h-3.5 w-3.5" />, regularRoots)}
              </>
            ) : (
              renderTreeRoot(
                activeView === "favorites" ? messages.tree.titleFavorites : activeView === "trash" ? messages.tree.titleTrash : messages.tree.titleAll,
                activeView === "favorites" ? <Heart className="h-3.5 w-3.5" /> : <ListTree className="h-3.5 w-3.5" />,
                regularRoots,
              )
            )}
          </div>
        )}
      </ScrollArea>
    </aside>
  )
}
