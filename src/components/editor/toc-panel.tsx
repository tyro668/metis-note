import { cn } from "@/lib/utils"

export interface TocItem {
  level: number
  pos: number
  text: string
}

interface TocPanelProps {
  activePos: number | null
  collapseLabel: string
  emptyLabel: string
  expandLabel: string
  items: TocItem[]
  open: boolean
  title: string
  onOpenChange: (open: boolean) => void
  onSelect: (pos: number) => void
}

export function TocPanel({
  activePos,
  collapseLabel,
  emptyLabel,
  expandLabel,
  items,
  open,
  title,
  onOpenChange,
  onSelect,
}: TocPanelProps) {
  return (
    <section className="mb-4 rounded-2xl border border-[#e7ebf1] bg-[#fbfcfe] shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
        onClick={() => onOpenChange(!open)}
      >
        <div>
          <div className="text-sm font-semibold text-[#1f3045]">{title}</div>
          <div className="mt-1 text-xs text-[#667085]">{items.length > 0 ? `${items.length}` : emptyLabel}</div>
        </div>
        <span className="text-xs font-medium text-[#475467]">{open ? collapseLabel : expandLabel}</span>
      </button>

      {open ? (
        <div className="border-t border-[#eef2f7] px-3 py-3">
          {items.length === 0 ? (
            <div className="rounded-xl bg-white px-3 py-2.5 text-sm text-[#98a2b3]">{emptyLabel}</div>
          ) : (
            <div className="space-y-1">
              {items.map((item) => (
                <button
                  key={`${item.pos}-${item.text}`}
                  type="button"
                  className={cn(
                    "flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white",
                    activePos === item.pos ? "bg-white font-medium text-[#1f3045]" : "text-[#667085]",
                  )}
                  style={{ paddingLeft: `${item.level * 12}px` }}
                  onClick={() => onSelect(item.pos)}
                >
                  <span className="truncate">{item.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
