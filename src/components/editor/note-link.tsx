import { useSyncExternalStore } from "react"
import { mergeAttributes, Node } from "@tiptap/core"
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react"
import { FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NoteLinkResolution, NoteLinkResolutionMap } from "@/shared/notes"

export class NoteLinkRenderStore {
  private snapshot: NoteLinkResolutionMap = {}
  private readonly missingSnapshots = new Map<string, NoteLinkResolution>()
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (noteId: string, fallbackTitle: string): NoteLinkResolution => {
    const resolved = this.snapshot[noteId]

    if (resolved) {
      return resolved
    }

    const cacheKey = `${noteId}\u0000${fallbackTitle}`
    const cached = this.missingSnapshots.get(cacheKey)

    if (cached) {
      return cached
    }

    const missingSnapshot = {
      title: fallbackTitle,
      exists: false,
    } satisfies NoteLinkResolution
    this.missingSnapshots.set(cacheKey, missingSnapshot)

    return missingSnapshot
  }

  replace(nextSnapshot: NoteLinkResolutionMap) {
    this.snapshot = nextSnapshot

    for (const listener of this.listeners) {
      listener()
    }
  }
}

interface NoteLinkOptions {
  renderStore: NoteLinkRenderStore
  deletedTooltip: string
  modifierHint: string
  getPathLabel: (noteId: string) => string | null
  onOpenNote: (noteId: string) => void
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    noteLink: {
      insertNoteLink: (attrs: { noteId: string; title: string }) => ReturnType
    }
  }
}

function NoteLinkNodeView({ editor, extension, node }: NodeViewProps) {
  const noteId = typeof node.attrs.noteId === "string" ? node.attrs.noteId : ""
  const fallbackTitle = typeof node.attrs.title === "string" && node.attrs.title.trim() ? node.attrs.title.trim() : ""
  const resolved = useSyncExternalStore(
    extension.options.renderStore.subscribe,
    () => extension.options.renderStore.getSnapshot(noteId, fallbackTitle),
  )
  const displayTitle = resolved.exists ? resolved.title : fallbackTitle || resolved.title || extension.options.deletedTooltip
  const pathLabel = resolved.exists ? extension.options.getPathLabel(noteId) : null
  const tooltip = resolved.exists
    ? [displayTitle, pathLabel, editor.isEditable ? extension.options.modifierHint : null].filter(Boolean).join("\n")
    : extension.options.deletedTooltip

  return (
    <NodeViewWrapper as="span" className="inline-flex align-baseline" contentEditable={false}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[14px] font-medium transition",
          resolved.exists
            ? "cursor-pointer border-[#d9d6fe] bg-[#f5f3ff] text-[#5b21b6] hover:bg-[#ede9fe]"
            : "border-[#e4e7ec] bg-[#f8fafc] text-[#98a2b3] line-through",
        )}
        title={tooltip}
        onClick={(event) => {
          if (!noteId || !resolved.exists) {
            return
          }

          if (editor.isEditable && !event.metaKey && !event.ctrlKey) {
            return
          }

          event.preventDefault()
          extension.options.onOpenNote(noteId)
        }}
      >
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span>{displayTitle}</span>
      </span>
    </NodeViewWrapper>
  )
}

export const NoteLink = Node.create<NoteLinkOptions>({
  name: "noteLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      renderStore: new NoteLinkRenderStore(),
      deletedTooltip: "Document deleted",
      modifierHint: "Cmd/Ctrl+click to open",
      getPathLabel: () => null,
      onOpenNote: () => undefined,
    }
  },

  addAttributes() {
    return {
      noteId: {
        default: "",
      },
      title: {
        default: "",
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "span[data-note-link]",
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-note-link": "",
        "data-note-id": node.attrs.noteId,
        "data-title": node.attrs.title,
      }),
      node.attrs.title || "",
    ]
  },

  renderText({ node }) {
    return typeof node.attrs?.title === "string" ? node.attrs.title : ""
  },

  addCommands() {
    return {
      insertNoteLink:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs,
          }),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteLinkNodeView)
  },
})
