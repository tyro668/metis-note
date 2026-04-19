import { Dialog, DialogCloseButton, DialogContent } from "@/components/ui/dialog"

interface ImageLightboxProps {
  alt: string | null
  closeLabel: string
  open: boolean
  src: string
  onOpenChange: (open: boolean) => void
}

export function ImageLightbox({ alt, closeLabel, open, src, onOpenChange }: ImageLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(94vw,1200px)] border-none bg-transparent shadow-none">
        <div className="relative flex max-h-[88vh] min-h-[240px] items-center justify-center">
          <DialogCloseButton className="absolute right-2 top-2 z-10 bg-[rgba(15,23,42,0.68)] text-white hover:bg-[rgba(15,23,42,0.82)]" title={closeLabel} />
          <img
            alt={alt ?? ""}
            className="max-h-[88vh] max-w-full rounded-2xl bg-white object-contain shadow-[0_32px_72px_rgba(15,23,42,0.38)]"
            src={src}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
