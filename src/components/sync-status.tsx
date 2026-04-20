import { useCallback, useEffect, useState } from "react"
import { Cloud, CloudOff, Loader2, RefreshCw, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/provider"
import { cn } from "@/lib/utils"
import type { SyncStatus } from "@/shared/sync"

export function SyncStatusIndicator() {
  const { messages } = useI18n()
  const [status, setStatus] = useState<SyncStatus>({ state: "not-configured" })
  const [syncing, setSyncing] = useState(false)

  const refreshStatus = useCallback(async () => {
    try {
      const s = await window.metisNote.sync.getStatus()
      setStatus(s)
    } catch {
      // IPC not available yet
    }
  }, [])

  useEffect(() => {
    refreshStatus()
    const timer = setInterval(refreshStatus, 5000)
    return () => clearInterval(timer)
  }, [refreshStatus])

  const handleSyncNow = useCallback(async () => {
    setSyncing(true)
    try {
      await window.metisNote.sync.syncNow()
      await refreshStatus()
    } finally {
      setSyncing(false)
    }
  }, [refreshStatus])

  const statusLabel = (() => {
    switch (status.state) {
      case "idle":
        return messages.sync.status.idle
      case "syncing":
        return messages.sync.status.syncing
      case "error":
        return messages.sync.status.error
      case "conflict":
        return messages.sync.status.conflict
      case "disabled":
        return messages.sync.status.disabled
      case "not-configured":
        return messages.sync.status.notConfigured
    }
  })()

  const icon = (() => {
    switch (status.state) {
      case "idle":
        return <Cloud className="size-4 text-green-600" />
      case "syncing":
        return <Loader2 className="size-4 animate-spin text-blue-500" />
      case "error":
        return <AlertTriangle className="size-4 text-red-500" />
      case "conflict":
        return <AlertTriangle className="size-4 text-amber-500" />
      case "disabled":
      case "not-configured":
        return <CloudOff className="size-4 text-muted-foreground" />
    }
  })()

  if (status.state === "not-configured" || status.state === "disabled") {
    return null
  }

  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-xs text-muted-foreground">{statusLabel}</span>
      {status.state === "idle" && (
        <Button variant="ghost" size="icon" className="size-6" onClick={handleSyncNow} disabled={syncing}>
          <RefreshCw className={cn("size-3", syncing && "animate-spin")} />
        </Button>
      )}
    </div>
  )
}
