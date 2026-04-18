import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AppMessages } from "@/shared/i18n"

export type AiWritePanelStatus = "thinking" | "writing" | "done" | "error"

export interface AiWritePanelPosition {
  top: number
  left: number
}

interface AiWritePanelProps {
  status: AiWritePanelStatus
  text: string
  errorMessage: string | null
  position: AiWritePanelPosition
  messages: AppMessages["editor"]["aiWrite"]
  onConfirm: () => void
  onCancel: () => void
  onRetry: () => void
}

export function AiWritePanel({
  status,
  text,
  errorMessage,
  position,
  messages,
  onConfirm,
  onCancel,
  onRetry,
}: AiWritePanelProps) {
  const isGenerating = status === "thinking" || status === "writing"
  const canConfirm = status === "done" && text.trim().length > 0
  const bodyText =
    status === "error" ? errorMessage || messages.requestFailed : text || (status === "thinking" ? messages.thinking : messages.writing)

  return (
    <div
      className="absolute z-30 w-[min(32rem,calc(100%-1.5rem))] max-w-[32rem] rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] shadow-[0_18px_44px_rgba(15,23,42,0.12)]"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div className="flex min-w-0">
        <div className="w-1 shrink-0 rounded-l-2xl bg-[#7c3aed]" />
        <div className="min-w-0 flex-1 px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-medium text-[#475467]">
            <Sparkles className={cn("h-4 w-4 text-[#7c3aed]", isGenerating && "animate-pulse")} />
            <span>{status === "thinking" ? messages.thinking : status === "writing" ? messages.writing : messages.slashLabel}</span>
          </div>

          <div className="mt-3 max-h-[320px] overflow-y-auto whitespace-pre-wrap pr-1 text-[15px] leading-7 text-[#344054]">
            {bodyText}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {status === "error" ? (
              <>
                <Button className="h-9 px-3 text-sm" size="sm" onClick={onRetry}>
                  {messages.retryButton}
                </Button>
                <Button className="h-9 px-3 text-sm" size="sm" variant="outline" onClick={onCancel}>
                  {messages.closeButton}
                </Button>
              </>
            ) : status === "done" ? (
              <>
                <Button className="h-9 px-3 text-sm" disabled={!canConfirm} size="sm" onClick={onConfirm}>
                  {messages.confirmButton}
                </Button>
                <Button className="h-9 px-3 text-sm" size="sm" variant="outline" onClick={onCancel}>
                  {messages.cancelButton}
                </Button>
              </>
            ) : (
              <Button className="h-9 px-3 text-sm" size="sm" variant="outline" onClick={onCancel}>
                {messages.cancelButton}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
