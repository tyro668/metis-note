import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useI18n } from "@/i18n/provider"
import type { ConflictResolution, SyncConflict } from "@/shared/sync"

interface ConflictDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConflictDialog({ open, onOpenChange }: ConflictDialogProps) {
  const { messages } = useI18n()
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [resolving, setResolving] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      window.metisNote.sync.getPendingConflicts().then(setConflicts)
    }
  }, [open])

  const handleResolve = useCallback(async (conflictId: string, resolution: ConflictResolution) => {
    setResolving(conflictId)

    try {
      await window.metisNote.sync.resolveConflict(conflictId, resolution)
      setConflicts((prev) => prev.filter((c) => c.id !== conflictId))
    } finally {
      setResolving(null)
    }

    if (conflicts.length <= 1) {
      onOpenChange(false)
    }
  }, [conflicts.length, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{messages.sync.conflict.title}</DialogTitle>
          <DialogCloseButton title="Close" />
        </DialogHeader>
        <DialogBody className="space-y-4">
          {conflicts.map((conflict) => (
            <div key={conflict.id} className="rounded-md border p-4 space-y-3">
              <div className="font-medium text-sm">{conflict.noteTitle || conflict.filePath}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(conflict.detectedAt).toLocaleString()}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resolving === conflict.id}
                  onClick={() => handleResolve(conflict.id, "keep-local")}
                >
                  {messages.sync.conflict.keepLocal}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resolving === conflict.id}
                  onClick={() => handleResolve(conflict.id, "keep-cloud")}
                >
                  {messages.sync.conflict.keepCloud}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resolving === conflict.id}
                  onClick={() => handleResolve(conflict.id, "keep-both")}
                >
                  {messages.sync.conflict.keepBoth}
                </Button>
              </div>
            </div>
          ))}
          {conflicts.length === 0 && (
            <p className="text-sm text-muted-foreground">{messages.sync.status.idle}</p>
          )}
        </DialogBody>
        <DialogFooter />
      </DialogContent>
    </Dialog>
  )
}
