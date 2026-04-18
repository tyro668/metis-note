import { useEffect, useState } from "react"
import { ChevronDown, Paperclip } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NoteSummary } from "@/shared/notes"

interface NoteBacklinksProps {
  noteId: string
  notes: NoteSummary[]
  summaryLabel: (count: number) => string
  expandLabel: string
  collapseLabel: string
  onOpenNote: (noteId: string) => void
}

export function NoteBacklinks({
  noteId,
  notes,
  summaryLabel,
  expandLabel,
  collapseLabel,
  onOpenNote,
}: NoteBacklinksProps) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setExpanded(false)
  }, [noteId])

  if (notes.length === 0) {
    return null
  }

  return (
    <div className="mb-6 rounded-2xl border border-[#e7ebf1] bg-[#fbfcfe]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-[#475467]">
          <Paperclip className="h-4 w-4 shrink-0 text-[#98a2b3]" />
          <span className="truncate">{summaryLabel(notes.length)}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#667085]">
          {expanded ? collapseLabel : expandLabel}
          <ChevronDown className={cn("h-4 w-4 transition", expanded && "rotate-180")} />
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-[#eef2f7] px-3 py-2">
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm text-[#344054] transition hover:bg-white"
              onClick={() => onOpenNote(note.id)}
            >
              {note.title}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
