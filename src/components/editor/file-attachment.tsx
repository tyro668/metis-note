import { mergeAttributes, Node } from "@tiptap/core"
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react"
import { ExternalLink, FileText, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatFileSize, getFileExtension } from "@/shared/assets"

interface FileAttachmentAttrs {
  src: string
  filename: string
  size?: number | null
  mimeType?: string | null
}

interface FileAttachmentOptions {
  onOpenFile: (source: string) => void
  openLabel: string
  removeLabel: string
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fileAttachment: {
      insertFileAttachment: (attrs: FileAttachmentAttrs) => ReturnType
    }
  }
}

function FileAttachmentNodeView({ deleteNode, editor, extension, node, selected }: NodeViewProps) {
  const source = typeof node.attrs.src === "string" ? node.attrs.src : ""
  const filename = typeof node.attrs.filename === "string" && node.attrs.filename.trim() ? node.attrs.filename.trim() : "attachment"
  const size = typeof node.attrs.size === "number" ? node.attrs.size : null
  const extensionLabel = getFileExtension(filename).toUpperCase() || "FILE"

  return (
    <NodeViewWrapper as="div" className="my-4" contentEditable={false}>
      <div
        className={cn(
          "group flex items-center gap-4 rounded-2xl border border-[#e7ebf1] bg-[#fbfcfe] px-4 py-3 shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition",
          source && "cursor-pointer hover:border-[#c7d7fe] hover:bg-[#f7faff]",
          selected && "border-[#8eb0ff] ring-2 ring-[rgba(47,101,246,0.12)]",
        )}
        onClick={() => {
          if (!source) {
            return
          }

          extension.options.onOpenFile(source)
        }}
      >
        <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#eef4ff] text-[#2f65f6]">
          <FileText className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[#1f3045]">{filename}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#667085]">
            <span className="rounded-full bg-white px-2 py-0.5 font-medium text-[#475467] shadow-[0_0_0_1px_rgba(226,232,240,0.9)]">
              {extensionLabel}
            </span>
            {size !== null ? <span>{formatFileSize(size)}</span> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#667085] transition hover:bg-white hover:text-[#1f3045]"
            title={extension.options.openLabel}
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={(event) => {
              event.stopPropagation()

              if (!source) {
                return
              }

              extension.options.onOpenFile(source)
            }}
          >
            <ExternalLink className="h-4 w-4" />
          </button>

          {editor.isEditable && selected ? (
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#667085] transition hover:bg-white hover:text-[#b42318]"
              title={extension.options.removeLabel}
              onMouseDown={(event) => {
                event.preventDefault()
              }}
              onClick={(event) => {
                event.stopPropagation()
                deleteNode()
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

export const FileAttachment = Node.create<FileAttachmentOptions>({
  name: "fileAttachment",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      onOpenFile: () => undefined,
      openLabel: "Open attachment",
      removeLabel: "Remove asset",
    }
  },

  addAttributes() {
    return {
      src: {
        default: "",
      },
      filename: {
        default: "attachment",
      },
      size: {
        default: null,
      },
      mimeType: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "div[data-file-attachment]",
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-file-attachment": "",
        "data-src": node.attrs.src,
        "data-filename": node.attrs.filename,
      }),
      node.attrs.filename || "attachment",
    ]
  },

  renderText({ node }) {
    return typeof node.attrs?.filename === "string" ? node.attrs.filename : "attachment"
  },

  addCommands() {
    return {
      insertFileAttachment:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs,
          }),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileAttachmentNodeView)
  },
})
