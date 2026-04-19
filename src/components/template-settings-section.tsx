import { useMemo, useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/provider"
import { cn } from "@/lib/utils"
import type { TemplateSummary } from "@/shared/templates"
import { TemplateDialog, type TemplateDialogValues } from "@/components/template-dialog"

interface TemplateSettingsSectionProps {
  templates: TemplateSummary[]
  isLoading: boolean
  feedback: { tone: "success" | "error"; message: string } | null
  pendingDeleteId: string | null
  onUpdateTemplate: (id: string, values: TemplateDialogValues) => Promise<void>
  onDeleteTemplate: (id: string) => Promise<void>
}

export function TemplateSettingsSection({
  templates,
  isLoading,
  feedback,
  pendingDeleteId,
  onUpdateTemplate,
  onDeleteTemplate,
}: TemplateSettingsSectionProps) {
  const { messages } = useI18n()
  const templateMessages = messages.settings.templates
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const editableTemplates = useMemo(
    () => templates.filter((template) => !template.builtIn),
    [templates],
  )
  const editingTemplate = editableTemplates.find((template) => template.id === editingTemplateId) ?? null

  return (
    <>
      <div>
        {feedback ? (
          <div
            className={cn(
              "rounded-xl border px-4 py-3 text-sm",
              feedback.tone === "success"
                ? "border-[rgba(18,183,106,0.24)] bg-[rgba(18,183,106,0.08)] text-[rgba(2,122,72,0.96)]"
                : "border-[rgba(180,35,24,0.2)] bg-[rgba(180,35,24,0.06)] text-[rgba(180,35,24,0.96)]",
            )}
          >
            {feedback.message}
          </div>
        ) : null}

        <h1 className="mt-6 text-[22px] font-semibold text-[#1f3045] dark:text-slate-100">{templateMessages.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#667085] dark:text-slate-400">{templateMessages.description}</p>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {isLoading ? (
              <div className="rounded-[1.2rem] border border-[#e7ebf1] bg-white px-5 py-6 text-sm text-[#667085] dark:border-[#243041] dark:bg-[#0f172a] dark:text-slate-400">
                {templateMessages.loading}
              </div>
            ) : templates.length === 0 ? (
              <div className="rounded-[1.2rem] border border-[#e7ebf1] bg-white px-5 py-6 text-sm text-[#667085] dark:border-[#243041] dark:bg-[#0f172a] dark:text-slate-400">
                {templateMessages.empty}
              </div>
            ) : (
              templates.map((template) => (
                <article key={template.id} className="rounded-[1.2rem] border border-[#e7ebf1] bg-white px-5 py-5 dark:border-[#243041] dark:bg-[#0f172a]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-[#1f3045] dark:text-slate-100">{template.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-[#98a2b3] dark:text-slate-500">
                      <span>{template.category}</span>
                      <span className={cn("rounded-full px-2 py-1 font-medium", template.builtIn ? "bg-[#eef4ff] text-[#175cd3]" : "bg-[#ecfdf3] text-[#027a48]")}>
                        {template.builtIn ? templateMessages.builtInBadge : templateMessages.customBadge}
                      </span>
                    </div>
                  </div>

                  {!template.builtIn ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="h-9 rounded-xl border-[#d0d5dd] px-3 text-sm dark:border-[#334155]"
                        onClick={() => {
                          setEditingTemplateId(template.id)
                          setErrorMessage(null)
                          setIsEditing(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        {templateMessages.actions.edit}
                      </Button>
                      <Button
                        variant="outline"
                        className="h-9 rounded-xl border-[rgba(180,35,24,0.18)] px-3 text-sm text-[#b42318] hover:bg-[rgba(180,35,24,0.06)]"
                        disabled={pendingDeleteId === template.id}
                        onClick={() => {
                          void onDeleteTemplate(template.id)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        {templateMessages.actions.delete}
                      </Button>
                    </div>
                  ) : null}
                </div>

                <p className="mt-3 text-sm leading-7 text-[#667085] dark:text-slate-400">{template.description}</p>
                <div className="mt-4 rounded-2xl border border-[#edf2f7] bg-[#fbfcfe] px-4 py-4 text-sm leading-7 text-[#667085] dark:border-[#243041] dark:bg-[#111827] dark:text-slate-400">
                  {template.previewText}
                </div>
                </article>
              ))
            )}
        </div>
      </div>

      <TemplateDialog
        open={isEditing}
        title={templateMessages.dialog.editTitle}
        closeLabel={templateMessages.dialog.close}
        submitLabel={templateMessages.dialog.save}
        cancelLabel={templateMessages.dialog.cancel}
        titleLabel={templateMessages.fields.title}
        descriptionLabel={templateMessages.fields.description}
        categoryLabel={templateMessages.fields.category}
        titlePlaceholder={templateMessages.placeholders.title}
        descriptionPlaceholder={templateMessages.placeholders.description}
        categoryPlaceholder={templateMessages.placeholders.category}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        initialValues={{
          title: editingTemplate?.title ?? "",
          description: editingTemplate?.description ?? "",
          category: editingTemplate?.category ?? "",
        }}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditing(false)
            setEditingTemplateId(null)
            setErrorMessage(null)
          }
        }}
        onSubmit={async (values) => {
          if (!editingTemplateId) {
            return
          }

          setIsSubmitting(true)
          setErrorMessage(null)

          try {
            await onUpdateTemplate(editingTemplateId, values)
            setIsEditing(false)
            setEditingTemplateId(null)
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : templateMessages.errors.updateFailed)
          } finally {
            setIsSubmitting(false)
          }
        }}
      />
    </>
  )
}
