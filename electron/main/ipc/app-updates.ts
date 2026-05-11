import { ipcMain } from "electron"
import { AppUpdaterService } from "../services/app-updater"

export function registerAppUpdateHandlers(appUpdater: AppUpdaterService) {
  ipcMain.removeHandler("updates:getCurrentInfo")
  ipcMain.removeHandler("updates:check")
  ipcMain.removeHandler("updates:installLatest")
  ipcMain.removeHandler("updates:openReleasePage")

  ipcMain.handle("updates:getCurrentInfo", async () => {
    return appUpdater.getCurrentInfo()
  })

  ipcMain.handle("updates:check", async () => {
    return appUpdater.checkForUpdates()
  })

  ipcMain.handle("updates:installLatest", async () => {
    return appUpdater.installLatestRelease()
  })

  ipcMain.handle("updates:openReleasePage", async (_event, releasePageUrl?: string) => {
    await appUpdater.openReleasePage(releasePageUrl)
  })
}
