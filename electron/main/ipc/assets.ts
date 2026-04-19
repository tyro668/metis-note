import { BrowserWindow, ipcMain } from "electron"
import type { AssetImportPayload } from "../../../src/shared/assets"
import { AssetStore } from "../services/asset-store"

function normalizePayload(payload: AssetImportPayload) {
  return {
    ...payload,
    bytes: payload.bytes ? new Uint8Array(payload.bytes) : undefined,
  } satisfies AssetImportPayload
}

export function registerAssetHandlers(assetStore: AssetStore) {
  ipcMain.removeHandler("assets:importImage")
  ipcMain.removeHandler("assets:importFile")
  ipcMain.removeHandler("assets:pickAndImportImage")
  ipcMain.removeHandler("assets:pickAndImportFile")
  ipcMain.removeHandler("assets:openFile")

  ipcMain.handle("assets:importImage", async (_event, payload: AssetImportPayload) => {
    return assetStore.importImage(normalizePayload(payload))
  })

  ipcMain.handle("assets:importFile", async (_event, payload: AssetImportPayload) => {
    return assetStore.importFile(normalizePayload(payload))
  })

  ipcMain.handle("assets:pickAndImportImage", async (event, noteId: string) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
    return assetStore.pickAndImportImage(noteId, parentWindow)
  })

  ipcMain.handle("assets:pickAndImportFile", async (event, noteId: string) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
    return assetStore.pickAndImportFile(noteId, parentWindow)
  })

  ipcMain.handle("assets:openFile", async (_event, source: string) => {
    await assetStore.openFile(source)
  })
}
