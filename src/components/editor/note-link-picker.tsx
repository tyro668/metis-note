import { useEffect, useRef } from "react"
import { FileText, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AiWritePanelPosition } from "@/components/editor/ai-write-panel"

export interface NoteLinkPickerItem {
  id: string
  title: string
  pathLabel: string | null
}

interface NoteLinkPickerProps {
  query: string
  items: NoteLinkPickerItem[]
  selectedIndex: number
  position: AiWritePanelPosition
  searchPlaceholder: string
  emptyLabel: string
  onQueryChange: (value: string) => void
  onSelect: (item: NoteLinkPickerItem) => void
  onSelectIndex: (index: number) => void
  onClose: () => void
}

export function NoteLinkPicker({
  query,
  items,
  selectedIndex,
  position,
  searchPlaceholder,
  emptyLabel,
  onQueryChange,
  onSelect,
  onSelectIndex,
  onClose,
}: NoteLinkPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const input = inputRef.current

      if (!input) {
        return
      }

      input.focus()
      const cursorPosition = input.value.length
      input.setSelectionRange(cursorPosition, cursorPosition)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [])

  return (
    <div
      className="absolute z-30 w-[360px] rounded-2xl border border-[#e7ebf1] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.12)]"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-[#fbfcfe] px-3">
        <Search className="h-4 w-4 shrink-0 text-[#98a2b3]" />
        <input
          ref={inputRef}
          className="h-11 w-full border-none bg-transparent text-sm text-[#344054] outline-none placeholder:text-[#98a2b3]"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault()

              if (items.length === 0) {
                return
              }

              const offset = event.key === "ArrowDown" ? 1 : -1
              const nextIndex = (selectedIndex + offset + items.length) % items.length
              onSelectIndex(nextIndex)
              return
            }

            if (event.key === "Enter") {
              event.preventDefault()
              const item = items[selectedIndex]

              if (item) {
                onSelect(item)
              }

              return
            }

            if (event.key === "Escape") {
              event.preventDefault()
              onClose()
            }
          }}
        />
      </div>

      <div className="mt-2 max-h-[280px] overflow-y-auto">
        {items.length > 0 ? (
          items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition",
                index === selectedIndex ? "bg-[#f5f3ff]" : "hover:bg-[#f8fafc]",
              )}
              onMouseDown={(event) => {
                event.preventDefault()
              }}
              onMouseEnter={() => onSelectIndex(index)}
              onClick={() => onSelect(item)}
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#ede9fe] bg-[#f5f3ff] text-[#7c3aed]">
                <FileText className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[#1f3045]">{item.title}</span>
                {item.pathLabel ? <span className="mt-1 block truncate text-xs text-[#667085]">{item.pathLabel}</span> : null}
              </span>
            </button>
          ))
        ) : (
          <div className="px-3 py-6 text-center text-sm text-[#98a2b3]">{emptyLabel}</div>
        )}
      </div>
    </div>
  )
}
