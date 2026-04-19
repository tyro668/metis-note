import { useEffect, useMemo, useState } from "react"
import { Layers3 } from "lucide-react"
import type { TemplateSummary } from "@/shared/templates"
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface TemplatePickerDialogProps {
  open: boolean
  templates: TemplateSummary[]
  isLoading: boolean
  isSubmitting: boolean
  errorMessage: string | null
  title: string
  closeLabel: string
  createLabel: string
  cancelLabel: string
  loadingLabel: string
  emptyLabel: string
  builtInLabel: string
  customLabel: string
  onOpenChange: (open: boolean) => void
  onSubmit: (templateId: string) => Promise<void> | void
}

export function TemplatePickerDialog({
  open,
  templates,
  isLoading,
  isSubmitting,
  errorMessage,
  title,
  closeLabel,
  createLabel,
  cancelLabel,
  loadingLabel,
  emptyLabel,
  builtInLabel,
  customLabel,
  onOpenChange,
  onSubmit,
}: TemplatePickerDialogProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setSelectedTemplateId((current) => current ?? templates[0]?.id ?? null)
  }, [open, templates])

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? templates[0] ?? null,
    [selectedTemplateId, templates],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-48px)] max-w-[920px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogCloseButton title={closeLabel} />
        </DialogHeader>

        <DialogBody className="min-h-[480px]">
          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-[#dbe2eb] bg-[#fbfcfe] px-5 py-6 text-sm text-[#667085] dark:border-[#243041] dark:bg-[#111827] dark:text-slate-400">
              {loadingLabel}
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#dbe2eb] bg-[#fbfcfe] px-5 py-6 text-sm text-[#667085] dark:border-[#243041] dark:bg-[#111827] dark:text-slate-400">
              {emptyLabel}
            </div>
          ) : (
            <div className="grid min-h-[420px] gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-2 overflow-y-auto pr-1">
                {templates.map((template) => {
                  const isSelected = template.id === selectedTemplate?.id

                  return (
                    <button
                      key={template.id}
                      type="button"
                      className={cn(
                        "w-full rounded-2xl border px-4 py-3 text-left transition",
                        isSelected
                          ? "border-[#cfe0ff] bg-[#eef4ff] shadow-[0_10px_24px_rgba(55,91,210,0.08)] dark:border-[#24416e] dark:bg-[#13233f]"
                          : "border-[#edf2f7] bg-white hover:border-[#d8e0ea] hover:bg-[#fcfdff] dark:border-[#243041] dark:bg-[#0f172a] dark:hover:bg-[#111827]",
                      )}
                      onClick={() => setSelectedTemplateId(template.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-semibold text-[#1f3045] dark:text-slate-100">{template.title}</span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-1 text-[11px] font-medium",
                            template.builtIn ? "bg-[#eef4ff] text-[#175cd3]" : "bg-[#ecfdf3] text-[#027a48]",
                          )}
                        >
                          {template.builtIn ? builtInLabel : customLabel}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-[#98a2b3] dark:text-slate-500">{template.category}</div>
                      <div className="mt-2 line-clamp-2 text-sm leading-6 text-[#667085] dark:text-slate-400">{template.description}</div>
                    </button>
                  )
                })}
              </div>

              {selectedTemplate ? (
                <div className="rounded-[1.2rem] border border-[#e7ebf1] bg-[#fbfcfe] p-5 dark:border-[#243041] dark:bg-[#111827]">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#e7ebf1] bg-white text-[#375bd2] dark:border-[#243041] dark:bg-[#0f172a] dark:text-[#8eb8ff]">
                      <Layers3 className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <div className="text-lg font-semibold text-[#1f3045] dark:text-slate-100">{selectedTemplate.title}</div>
                      <div className="mt-1 text-sm text-[#667085] dark:text-slate-400">{selectedTemplate.category}</div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-[#edf2f7] bg-white px-4 py-4 dark:border-[#243041] dark:bg-[#0f172a]">
                    <div className="text-sm font-medium text-[#1f3045] dark:text-slate-100">{selectedTemplate.description}</div>
                    <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#667085] dark:text-slate-400">{selectedTemplate.previewText}</div>
                  </div>

                  {errorMessage ? (
                    <div className="mt-4 rounded-xl border border-[rgba(180,35,24,0.2)] bg-[rgba(180,35,24,0.06)] px-4 py-3 text-sm text-[rgba(180,35,24,0.96)]">
                      {errorMessage}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </DialogBody>

        <DialogFooter className="border-t border-[#eef2f7] dark:border-[#243041]">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl border-[#d0d5dd] px-4 text-sm font-medium dark:border-[#334155]"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            className="h-10 rounded-xl px-4 text-sm font-medium"
            disabled={!selectedTemplate || isLoading || isSubmitting}
            onClick={() => {
              if (selectedTemplate) {
                void onSubmit(selectedTemplate.id)
              }
            }}
          >
            {createLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
