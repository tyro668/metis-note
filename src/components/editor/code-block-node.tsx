import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react"
import { Check, ChevronDown, Clipboard } from "lucide-react"
import { cn } from "@/lib/utils"

interface LowlightInstance {
  listLanguages(): string[]
}

interface ManagedCodeBlockOptions {
  lowlight: LowlightInstance
  defaultLanguage: string
  copyLabel: string
  copiedLabel: string
  languageLabel: string
  languagePlaceholder: string
}

function CodeBlockNodeView({ editor, node, updateAttributes, extension }: NodeViewProps) {
  const language = typeof node.attrs.language === "string" ? node.attrs.language : ""
  const [copied, setCopied] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [search, setSearch] = useState("")
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const options = extension.options as ManagedCodeBlockOptions
  const languages = useMemo(() => {
    const registered: string[] = options.lowlight.listLanguages()
    return registered.sort((a: string, b: string) => a.localeCompare(b))
  }, [options.lowlight])

  const filteredLanguages = useMemo(() => {
    if (!search.trim()) return languages
    const lower = search.toLowerCase()
    return languages.filter((lang: string) => lang.toLowerCase().includes(lower))
  }, [languages, search])

  const displayLanguage = language || options.defaultLanguage || "plaintext"

  const handleCopy = useCallback(() => {
    const codeContent = node.textContent
    void navigator.clipboard.writeText(codeContent).then(() => {
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }, [node])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const handleLanguageChange = useCallback(
    (lang: string) => {
      updateAttributes({ language: lang })
      setDropdownOpen(false)
      setSearch("")
    },
    [updateAttributes],
  )

  useEffect(() => {
    if (dropdownOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [dropdownOpen])

  useEffect(() => {
    if (!dropdownOpen) return

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as globalThis.Node)) {
        setDropdownOpen(false)
        setSearch("")
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [dropdownOpen])

  const isEditable = editor.isEditable

  return (
    <NodeViewWrapper className="code-block-wrapper relative" data-code-block-language={displayLanguage}>
      <div
        className="code-block-toolbar"
        contentEditable={false}
      >
        {/* Language selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            className={cn(
              "code-block-lang-btn",
              !isEditable && "pointer-events-none",
            )}
            onClick={() => {
              if (isEditable) setDropdownOpen((open) => !open)
            }}
            title={options.languageLabel}
          >
            <span className="text-xs">{displayLanguage}</span>
            {isEditable && <ChevronDown className="ml-1 h-3 w-3" />}
          </button>

          {dropdownOpen && (
            <div className="code-block-lang-dropdown">
              <input
                ref={searchInputRef}
                type="text"
                className="code-block-lang-search"
                placeholder={options.languagePlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === "Escape") {
                    setDropdownOpen(false)
                    setSearch("")
                  } else if (e.key === "Enter" && filteredLanguages.length > 0) {
                    handleLanguageChange(filteredLanguages[0])
                  }
                }}
              />
              <div className="code-block-lang-list">
                {filteredLanguages.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    className={cn("code-block-lang-item", lang === language && "code-block-lang-item-active")}
                    onClick={() => handleLanguageChange(lang)}
                  >
                    {lang}
                  </button>
                ))}
                {filteredLanguages.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-gray-400">—</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Copy button */}
        <button
          type="button"
          className="code-block-copy-btn"
          onClick={handleCopy}
          title={copied ? options.copiedLabel : options.copyLabel}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
        </button>
      </div>

      <pre>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  )
}

export const ManagedCodeBlock = CodeBlockLowlight.extend<ManagedCodeBlockOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      copyLabel: "Copy",
      copiedLabel: "Copied",
      languageLabel: "Language",
      languagePlaceholder: "Search…",
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView)
  },
})
