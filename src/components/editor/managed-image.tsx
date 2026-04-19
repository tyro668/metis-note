import { mergeAttributes } from "@tiptap/core"
import Image from "@tiptap/extension-image"
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react"
import { Eye, ImagePlus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ManagedImageOptions {
  HTMLAttributes: Record<string, unknown>
  onPreviewImage: (source: string, alt: string | null) => void
  onReplaceImage: () => Promise<Record<string, unknown> | null>
  previewLabel: string
  replaceLabel: string
  removeLabel: string
}

function ManagedImageNodeView({ deleteNode, editor, extension, node, selected, updateAttributes }: NodeViewProps) {
  const source = typeof node.attrs.src === "string" ? node.attrs.src : ""
  const alt = typeof node.attrs.alt === "string" && node.attrs.alt.trim() ? node.attrs.alt.trim() : null

  return (
    <NodeViewWrapper
      as="figure"
      className={cn("metis-image-node group relative my-5", selected && "metis-image-node-selected")}
      contentEditable={false}
    >
      <img
        alt={alt ?? ""}
        className={cn(
          "block max-h-[640px] w-full max-w-full rounded-2xl border border-[#e7ebf1] bg-[#f8fafc] object-contain shadow-[0_12px_28px_rgba(15,23,42,0.08)]",
          !editor.isEditable && "cursor-zoom-in",
        )}
        draggable={false}
        src={source}
        title={typeof node.attrs.title === "string" ? node.attrs.title : undefined}
        onClick={(event) => {
          if (!source || editor.isEditable) {
            return
          }

          event.preventDefault()
          extension.options.onPreviewImage(source, alt)
        }}
      />

      {editor.isEditable && selected ? (
        <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-[rgba(15,23,42,0.72)] px-2.5 py-2 text-white shadow-lg">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/12"
            title={extension.options.previewLabel}
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => {
              if (!source) {
                return
              }

              extension.options.onPreviewImage(source, alt)
            }}
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/12"
            title={extension.options.replaceLabel}
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => {
              void extension.options.onReplaceImage().then((nextAttributes: Record<string, unknown> | null) => {
                if (nextAttributes) {
                  updateAttributes(nextAttributes)
                }
              })
            }}
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/12"
            title={extension.options.removeLabel}
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => deleteNode()}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {alt ? <figcaption className="mt-2 text-center text-sm leading-6 text-[#667085]">{alt}</figcaption> : null}
    </NodeViewWrapper>
  )
}

export const ManagedImage = Image.extend<ManagedImageOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {},
      onPreviewImage: () => undefined,
      onReplaceImage: async () => null,
      previewLabel: "Preview image",
      replaceLabel: "Replace image",
      removeLabel: "Remove asset",
    }
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
      },
      height: {
        default: null,
      },
      size: {
        default: null,
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ManagedImageNodeView)
  },
})
