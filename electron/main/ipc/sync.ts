import { BrowserWindow, ipcMain } from "electron"

import type {
  BaiduPanAuthResult,
  ConflictResolution,
  GoogleDriveAuthResult,
  NoteSyncStateMap,
  SyncConfig,
  SyncConflict,
  SyncResult,
  SyncStatus,
} from "../../../src/shared/sync"
import type { SyncManager } from "../services/sync/sync-manager"
import type { BaiduPanAuthService } from "../services/sync/baidu-pan-auth"
import type { GoogleDriveAuthService } from "../services/sync/google-drive-auth"
import type { NoteStore } from "../services/note-store"

export function registerSyncHandlers(
  syncManager: SyncManager,
  noteStore: NoteStore,
  baiduPanAuthService: BaiduPanAuthService,
  googleDriveAuthService: GoogleDriveAuthService,
): void {
  const broadcast = (channel: string, payload: unknown) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, payload)
      }
    }
  }

  syncManager.on("status-changed", (status) => {
    broadcast("sync:statusChanged", status)
  })

  syncManager.on("sync-completed", (result) => {
    void (async () => {
      if (result.status === "success" && (result.pulled > 0 || result.deletedLocal > 0)) {
        try {
          await noteStore.reloadFromDisk()
        } catch (error) {
          console.error("[metis-note] Failed to reload note store after background sync.", error)
        }
      }

      broadcast("sync:syncCompleted", result)
    })()
  })

  ipcMain.handle("sync:getStatus", async (): Promise<SyncStatus> => {
    return syncManager.getStatus()
  })

  ipcMain.handle("sync:getConfig", async (): Promise<SyncConfig | null> => {
    return syncManager.getConfig()
  })

  ipcMain.handle("sync:configure", async (_event, config: SyncConfig): Promise<void> => {
    await syncManager.configure(config)
  })

  ipcMain.handle(
    "sync:authorizeBaiduPan",
    async (): Promise<BaiduPanAuthResult> => {
      return baiduPanAuthService.authorize()
    },
  )

  ipcMain.handle(
    "sync:authorizeGoogleDrive",
    async (_event, clientId: string): Promise<GoogleDriveAuthResult> => {
      return googleDriveAuthService.authorize(clientId)
    },
  )

  ipcMain.handle("sync:syncNow", async (): Promise<SyncResult> => {
    const result = await syncManager.syncNow()

    // After a successful sync that pulled changes, reload note store
    if (result.status === "success" && result.pulled > 0) {
      await noteStore.reloadFromDisk()
    }

    return result
  })

  ipcMain.handle("sync:setPassphrase", async (_event, passphrase: string): Promise<void> => {
    syncManager.setPassphrase(passphrase)
  })

  ipcMain.handle("sync:clearPassphrase", async (): Promise<void> => {
    syncManager.clearPassphrase()
  })

  ipcMain.handle("sync:getPendingConflicts", async (): Promise<SyncConflict[]> => {
    return syncManager.getPendingConflicts()
  })

  ipcMain.handle("sync:getNoteSyncStates", async (): Promise<NoteSyncStateMap> => {
    const notes = await noteStore.list()
    return syncManager.getNoteSyncStates(notes)
  })

  ipcMain.handle(
    "sync:resolveConflict",
    async (_event, conflictId: string, resolution: ConflictResolution): Promise<void> => {
      await syncManager.resolveConflict(conflictId, resolution)
    },
  )
}
