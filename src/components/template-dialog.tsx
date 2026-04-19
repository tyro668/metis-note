import { useEffect, useState } from "react"
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
import { FormControl, FormError, FormField, FormLabel } from "@/components/ui/form-field"

export interface TemplateDialogValues {
  title: string
  description: string
  category: string
}

interface TemplateDialogProps {
  open: boolean
  title: string
  closeLabel: string
  submitLabel: string
  cancelLabel: string
  titleLabel: string
  descriptionLabel: string
  categoryLabel: string
  titlePlaceholder: string
  descriptionPlaceholder: string
  categoryPlaceholder: string
  errorMessage: string | null
  isSubmitting: boolean
  initialValues: TemplateDialogValues
  onOpenChange: (open: boolean) => void
  onSubmit: (values: TemplateDialogValues) => Promise<void> | void
}

export function TemplateDialog({
  open,
  title,
  closeLabel,
  submitLabel,
  cancelLabel,
  titleLabel,
  descriptionLabel,
  categoryLabel,
  titlePlaceholder,
  descriptionPlaceholder,
  categoryPlaceholder,
  errorMessage,
  isSubmitting,
  initialValues,
  onOpenChange,
  onSubmit,
}: TemplateDialogProps) {
  const [values, setValues] = useState(initialValues)

  useEffect(() => {
    if (!open) {
      return
    }

    setValues(initialValues)
  }, [initialValues, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogCloseButton title={closeLabel} />
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void onSubmit(values)
          }}
        >
          <DialogBody>
            <div className="space-y-5">
              <FormField>
                <FormLabel>{titleLabel}</FormLabel>
                <FormControl>
                  <input
                    className="h-full w-full border-none bg-transparent text-[15px] text-[#243444] outline-none placeholder:text-[#98a2b3] dark:text-slate-100 dark:placeholder:text-slate-500"
                    placeholder={titlePlaceholder}
                    value={values.title}
                    onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
                  />
                </FormControl>
              </FormField>

              <FormField>
                <FormLabel>{descriptionLabel}</FormLabel>
                <FormControl className="min-h-[108px] items-start py-3">
                  <textarea
                    className="min-h-[84px] w-full resize-none border-none bg-transparent text-[15px] leading-7 text-[#243444] outline-none placeholder:text-[#98a2b3] dark:text-slate-100 dark:placeholder:text-slate-500"
                    placeholder={descriptionPlaceholder}
                    value={values.description}
                    onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
                  />
                </FormControl>
              </FormField>

              <FormField>
                <FormLabel>{categoryLabel}</FormLabel>
                <FormControl>
                  <input
                    className="h-full w-full border-none bg-transparent text-[15px] text-[#243444] outline-none placeholder:text-[#98a2b3] dark:text-slate-100 dark:placeholder:text-slate-500"
                    placeholder={categoryPlaceholder}
                    value={values.category}
                    onChange={(event) => setValues((current) => ({ ...current, category: event.target.value }))}
                  />
                </FormControl>
              </FormField>

              {errorMessage ? <FormError>{errorMessage}</FormError> : null}
            </div>
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
            <Button type="submit" className="h-10 rounded-xl px-4 text-sm font-medium" disabled={isSubmitting}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
