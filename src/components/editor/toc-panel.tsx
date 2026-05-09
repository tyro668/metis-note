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
    <section className="mb-4 rounded-2xl border border-[#e7ebf1] bg-[#fbfcfe] shadow-[0_10px_24px_rgba(15,23,42,0.05)] dark:border-[#243041] dark:bg-[#111827] dark:shadow-[0_18px_44px_rgba(0,0,0,0.28)]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
        onClick={() => onOpenChange(!open)}
      >
        <div>
          <div className="text-sm font-semibold text-[#1f3045] dark:text-slate-100">{title}</div>
          <div className="mt-1 text-xs text-[#667085] dark:text-slate-400">{items.length > 0 ? `${items.length}` : emptyLabel}</div>
        </div>
        <span className="text-xs font-medium text-[#475467] dark:text-slate-300">{open ? collapseLabel : expandLabel}</span>
      </button>

      {open ? (
        <div className="border-t border-[#eef2f7] px-3 py-3 dark:border-[#243041]">
          {items.length === 0 ? (
            <div className="rounded-xl bg-white px-3 py-2.5 text-sm text-[#98a2b3] dark:bg-[#0f172a] dark:text-slate-500">{emptyLabel}</div>
          ) : (
            <div className="space-y-1">
              {items.map((item) => (
                <button
                  key={`${item.pos}-${item.text}`}
                  type="button"
                  className={cn(
                    "flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white dark:hover:bg-[#0f172a]",
                    activePos === item.pos
                      ? "bg-white font-medium text-[#1f3045] dark:bg-[#13233f] dark:text-[#8eb8ff]"
                      : "text-[#667085] dark:text-slate-400",
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
