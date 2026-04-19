import { FolderOpen, Settings, Star, Trash2, type LucideIcon } from "lucide-react"
import { useI18n } from "@/i18n/provider"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { NoteView } from "@/shared/notes"

type AppScreen = "notes" | "settings"

interface NoteSidebarProps {
  activeScreen: AppScreen
  activeView: NoteView
  counts: Record<NoteView, number>
  onViewChange: (view: NoteView) => void
  onOpenSettings: () => void
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform)

const sideNavItems = [
  { view: "all", icon: FolderOpen },
  { view: "favorites", icon: Star },
  { view: "trash", icon: Trash2 },
] satisfies Array<{
  view: NoteView
  icon: LucideIcon
}>

function NavButton({
  label,
  count,
  icon: Icon,
  active,
  onClick,
}: {
  label: string
  count: number
  icon: LucideIcon
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm transition",
        active
          ? "bg-[#e8f0ff] font-medium text-[#2f6ef6] dark:bg-[#13233f] dark:text-[#8eb8ff]"
          : "text-[#475467] hover:bg-white/75 dark:text-slate-400 dark:hover:bg-[#111827]",
      )}
      onClick={onClick}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span className={cn("shrink-0 text-xs", active ? "text-[#2f6ef6] dark:text-[#8eb8ff]" : "text-[#98a2b3] dark:text-slate-500")}>
        {count}
      </span>
    </button>
  )
}

export function NoteSidebar({ activeScreen, activeView, counts, onViewChange, onOpenSettings }: NoteSidebarProps) {
  const { messages } = useI18n()
  const labels: Record<NoteView, string> = {
    all: messages.sidebar.all,
    favorites: messages.sidebar.favorites,
    trash: messages.sidebar.trash,
  }

  return (
    <aside className="sidebar flex w-full shrink-0 flex-col overflow-hidden border-b border-[#eceff4] bg-[linear-gradient(180deg,#f7faff,#f3f7fd)] dark:border-[#1f2937] dark:bg-[linear-gradient(180deg,#081120,#0b1323)] xl:w-[184px] xl:border-b-0 xl:border-r">
      {isMac ? <div className="window-chrome-spacer h-10 shrink-0" /> : null}

      <ScrollArea className="min-h-0 flex-1 px-3 py-4">
        <div className="space-y-1">
          {sideNavItems.map(({ view, icon }) => (
            <NavButton
              key={view}
              active={activeScreen === "notes" && activeView === view}
              count={counts[view]}
              icon={icon}
              label={labels[view]}
              onClick={() => onViewChange(view)}
            />
          ))}
        </div>
      </ScrollArea>

      <div className="border-t border-[#e7edf6] px-3 py-3 dark:border-[#1f2937]">
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
            activeScreen === "settings"
              ? "bg-[#e8f0ff] font-medium text-[#2f6ef6] dark:bg-[#13233f] dark:text-[#8eb8ff]"
              : "text-[#475467] hover:bg-white/75 dark:text-slate-400 dark:hover:bg-[#111827]",
          )}
          onClick={onOpenSettings}
        >
          <Settings className="h-[18px] w-[18px] shrink-0" />
          <span>{messages.sidebar.settings}</span>
        </button>
      </div>
    </aside>
  )
}
