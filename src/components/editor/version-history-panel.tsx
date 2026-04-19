import { Clock3, RotateCcw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface VersionHistoryListItem {
  timestamp: string | null
  title: string
  meta: string
  previewText: string
  isCurrent: boolean
}

interface VersionHistoryPanelProps {
  open: boolean
  isLoading: boolean
  restoringTimestamp: string | null
  items: VersionHistoryListItem[]
  selectedTimestamp: string | null
  title: string
  loadingLabel: string
  emptyLabel: string
  currentLabel: string
  previewLabel: string
  restoreLabel: string
  closeLabel: string
  onOpenChange: (open: boolean) => void
  onSelect: (timestamp: string | null) => void
  onRestore: (timestamp: string) => void
}

export function VersionHistoryPanel({
  open,
  isLoading,
  restoringTimestamp,
  items,
  selectedTimestamp,
  title,
  loadingLabel,
  emptyLabel,
  currentLabel,
  previewLabel,
  restoreLabel,
  closeLabel,
  onOpenChange,
  onSelect,
  onRestore,
}: VersionHistoryPanelProps) {
  if (!open) {
    return null
  }

  const selectedItem = items.find((item) => item.timestamp === selectedTimestamp) ?? null

  return (
    <aside className="flex min-h-[560px] w-full shrink-0 flex-col overflow-hidden rounded-[1.2rem] border border-[#e7ebf1] bg-[#fbfcfe] shadow-[0_18px_44px_rgba(15,23,42,0.08)] xl:w-[320px]">
      <div className="flex items-center justify-between gap-3 border-b border-[#eef2f7] px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#e7ebf1] bg-white text-[#375bd2]">
            <Clock3 className="h-4.5 w-4.5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-[#1f3045]">{title}</div>
            <div className="mt-1 text-xs text-[#98a2b3]">{items.length}</div>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#98a2b3] transition hover:bg-white hover:text-[#1f3045]"
          title={closeLabel}
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="rounded-2xl border border-dashed border-[#dbe2eb] bg-white px-4 py-5 text-sm text-[#667085]">
            {loadingLabel}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#dbe2eb] bg-white px-4 py-5 text-sm text-[#667085]">
            {emptyLabel}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const isSelected = item.timestamp === selectedTimestamp

              return (
                <button
                  key={item.timestamp ?? "current"}
                  type="button"
                  className={cn(
                    "w-full rounded-2xl border px-4 py-3 text-left transition",
                    isSelected
                      ? "border-[#cfe0ff] bg-[#eef4ff] shadow-[0_10px_24px_rgba(55,91,210,0.08)]"
                      : "border-[#edf2f7] bg-white hover:border-[#d8e0ea] hover:bg-[#fcfdff]",
                  )}
                  onClick={() => onSelect(item.timestamp)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#1f3045]">{item.title}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-1 text-[11px] font-medium",
                        item.isCurrent ? "bg-[#eff8ff] text-[#175cd3]" : isSelected ? "bg-white text-[#375bd2]" : "bg-[#f8fafc] text-[#667085]",
                      )}
                    >
                      {item.isCurrent ? currentLabel : isSelected ? previewLabel : item.meta}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[#98a2b3]">{item.isCurrent ? item.meta : item.meta}</div>
                  <div className="mt-2 line-clamp-2 text-sm leading-6 text-[#667085]">{item.previewText}</div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selectedItem && !selectedItem.isCurrent && selectedItem.timestamp ? (
        <div className="border-t border-[#eef2f7] bg-white/90 px-4 py-4">
          <Button
            className="h-10 w-full rounded-xl"
            disabled={restoringTimestamp === selectedItem.timestamp}
            onClick={() => onRestore(selectedItem.timestamp!)}
          >
            <RotateCcw className="h-4 w-4" />
            {restoreLabel}
          </Button>
        </div>
      ) : null}
    </aside>
  )
}
