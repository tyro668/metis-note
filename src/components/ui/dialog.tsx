import * as React from "react"
import { X } from "lucide-react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

interface DialogContextValue {
  onOpenChange: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

function useDialogContext() {
  const context = React.useContext(DialogContext)

  if (!context) {
    throw new Error("Dialog components must be used within <Dialog>.")
  }

  return context
}

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!open) {
      return
    }

    const originalOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false)
      }
    }

    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onOpenChange])

  if (!mounted || !open) {
    return null
  }

  return createPortal(
    <DialogContext.Provider value={{ onOpenChange }}>
      <div className="fixed inset-0 z-50">{children}</div>
    </DialogContext.Provider>,
    document.body,
  )
}

export function DialogContent({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) {
  const { onOpenChange } = useDialogContext()

  return (
    <div className="fixed inset-0">
      <div
        className="absolute inset-0 bg-[rgba(15,23,42,0.42)] backdrop-blur-sm"
        onMouseDown={() => onOpenChange(false)}
      />
      <div className="relative flex min-h-full items-center justify-center p-6">
        <div
          aria-modal="true"
          className={cn(
            "relative z-10 flex w-full flex-col overflow-hidden rounded-[12px] border border-[#e7ebf1] bg-white shadow-[0_24px_56px_rgba(15,23,42,0.22)]",
            className,
          )}
          role="dialog"
          onMouseDown={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export function DialogHeader({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between gap-4 px-5 pb-2 pt-5", className)}>{children}</div>
}

export function DialogTitle({
  children,
  className,
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-[19px] font-semibold tracking-[-0.02em] text-[#1f3045]", className)}>{children}</h2>
}

export function DialogCloseButton({
  className,
  title,
}: {
  className?: string
  title: string
}) {
  const { onOpenChange } = useDialogContext()

  return (
    <button
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-[#667085] transition hover:bg-[#f5f7fb]",
        className,
      )}
      title={title}
      type="button"
      onClick={() => onOpenChange(false)}
    >
      <X className="h-[18px] w-[18px]" />
    </button>
  )
}

export function DialogBody({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 pb-2 pt-4", className)}>{children}</div>
}

export function DialogFooter({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex shrink-0 items-center justify-end gap-4 px-5 pb-5 pt-4", className)}>{children}</div>
}
