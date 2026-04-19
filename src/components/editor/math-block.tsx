import { useEffect, useRef, useState } from "react"
import { Node, nodeInputRule } from "@tiptap/core"
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react"
import katex from "katex"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mathBlock: {
      setMathBlock: (latex?: string) => ReturnType
    }
  }
}

interface MathBlockOptions {
  placeholder: string
}

function MathBlockNodeView({ editor, extension, node, selected, updateAttributes }: NodeViewProps) {
  const latex = typeof node.attrs.latex === "string" ? node.attrs.latex : ""
  const [draft, setDraft] = useState(latex)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft(latex)
  }, [latex])

  useEffect(() => {
    const previewElement = previewRef.current

    if (!previewElement) {
      return
    }

    previewElement.innerHTML = ""

    try {
      katex.render(latex || "\\placeholder{}", previewElement, {
        displayMode: true,
        throwOnError: false,
        strict: "ignore",
      })
    } catch {
      previewElement.textContent = latex
    }
  }, [latex])

  return (
    <NodeViewWrapper className="metis-math-block" data-selected={selected ? "true" : "false"}>
      {editor.isEditable && selected ? (
        <textarea
          className="metis-math-block-input"
          placeholder={extension.options.placeholder}
          value={draft}
          onMouseDown={(event) => {
            event.stopPropagation()
          }}
          onChange={(event) => {
            const nextValue = event.target.value
            setDraft(nextValue)
            updateAttributes({
              latex: nextValue,
            })
          }}
        />
      ) : null}
      <div ref={previewRef} className="metis-math-block-preview" />
    </NodeViewWrapper>
  )
}

export const MathBlock = Node.create<MathBlockOptions>({
  name: "mathBlock",

  group: "block",

  atom: true,

  isolating: true,

  draggable: true,

  selectable: true,

  addOptions() {
    return {
      placeholder: "E = mc^2",
    }
  },

  addAttributes() {
    return {
      latex: {
        default: "",
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mathBlock"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-type": "mathBlock" }]
  },

  addCommands() {
    return {
      setMathBlock:
        (latex = "") =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              latex,
            },
          }),
    }
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: /^\$\$\s*([\s\S]+?)\s*\$\$$/,
        type: this.type,
        getAttributes: (match) => ({
          latex: typeof match[1] === "string" ? match[1].trim() : "",
        }),
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockNodeView)
  },
})
