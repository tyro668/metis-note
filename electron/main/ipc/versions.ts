import { ipcMain } from "electron"
import { getMessages, type AppLocale } from "../../../src/shared/i18n"
import { extractPlainTextFromContent } from "../../../src/shared/notes"
import { NoteStore } from "../services/note-store"
import { VersionStore } from "../services/version-store"

export function registerVersionHandlers(store: NoteStore, versionStore: VersionStore, locale: AppLocale) {
  const messages = getMessages(locale)

  ipcMain.removeHandler("versions:list")
  ipcMain.removeHandler("versions:get")
  ipcMain.removeHandler("versions:restore")

  ipcMain.handle("versions:list", async (_event, noteId: string) => {
    return versionStore.list(noteId)
  })

  ipcMain.handle("versions:get", async (_event, noteId: string, timestamp: string) => {
    return versionStore.get(noteId, timestamp)
  })

  ipcMain.handle("versions:restore", async (_event, noteId: string, timestamp: string) => {
    const note = await store.get(noteId)

    if (!note) {
      throw new Error(messages.errors.noteNotFound(noteId))
    }

    const snapshot = await versionStore.get(noteId, timestamp)

    if (!snapshot) {
      throw new Error(messages.editor.versionHistory.errors.versionNotFound)
    }

    await versionStore.createSnapshot(note)

    return store.update(noteId, {
      content: snapshot,
      plainText: extractPlainTextFromContent(snapshot),
    })
  })
}
