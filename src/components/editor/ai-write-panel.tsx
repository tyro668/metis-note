import { Sparkles } from "lucide-react"
import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AppMessages } from "@/shared/i18n"

export type AiWritePanelStatus = "prompting" | "thinking" | "writing" | "done" | "error"

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
  promptValue: string
  onConfirm: () => void
  onCancel: () => void
  onRetry: () => void
  onPromptChange: (value: string) => void
  onPromptSubmit: () => void
}

export function AiWritePanel({
  status,
  text,
  errorMessage,
  position,
  messages,
  promptValue,
  onConfirm,
  onCancel,
  onRetry,
  onPromptChange,
  onPromptSubmit,
}: AiWritePanelProps) {
  const promptInputRef = useRef<HTMLTextAreaElement>(null)
  const isPrompting = status === "prompting"
  const isGenerating = status === "thinking" || status === "writing"
  const canConfirm = status === "done" && text.trim().length > 0
  const bodyText =
    status === "error" ? errorMessage || messages.requestFailed : text || (status === "thinking" ? messages.thinking : messages.writing)

  useEffect(() => {
    if (!isPrompting) {
      return
    }

    promptInputRef.current?.focus()
  }, [isPrompting])

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
            <span>
              {status === "prompting"
                ? messages.promptTitle
                : status === "thinking"
                  ? messages.thinking
                  : status === "writing"
                    ? messages.writing
                    : messages.slashLabel}
            </span>
          </div>

          {isPrompting ? (
            <>
              <p className="mt-3 text-sm leading-6 text-[#667085]">
                {messages.promptDescription}
              </p>
              <textarea
                ref={promptInputRef}
                className="mt-3 min-h-[112px] w-full resize-y rounded-2xl border border-[#d0d7e2] bg-white px-3.5 py-3 text-[14px] leading-6 text-[#344054] outline-none transition placeholder:text-[#98a2b3] focus:border-[#7c3aed] focus:ring-2 focus:ring-[rgba(124,58,237,0.12)]"
                placeholder={messages.promptPlaceholder}
                value={promptValue}
                onChange={(event) => onPromptChange(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault()
                    onPromptSubmit()
                  }
                }}
              />
              {errorMessage ? (
                <p className="mt-3 text-sm leading-6 text-[#b42318]">{errorMessage}</p>
              ) : (
                <p className="mt-3 text-xs text-[#98a2b3]">{messages.promptShortcutHint}</p>
              )}
            </>
          ) : (
            <div className="mt-3 max-h-[320px] overflow-y-auto whitespace-pre-wrap pr-1 text-[15px] leading-7 text-[#344054]">
              {bodyText}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {status === "prompting" ? (
              <>
                <Button className="h-9 px-3 text-sm" size="sm" onClick={onPromptSubmit}>
                  {messages.generateButton}
                </Button>
                <Button className="h-9 px-3 text-sm" size="sm" variant="outline" onClick={onCancel}>
                  {messages.cancelButton}
                </Button>
              </>
            ) : status === "error" ? (
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
