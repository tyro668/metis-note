import { ipcMain } from "electron"
import { getMessages, type AppLocale } from "../../../src/shared/i18n"
import type { SaveTemplateInput } from "../../../src/shared/templates"
import { NoteStore } from "../services/note-store"
import { TemplateStore } from "../services/template-store"

export function registerTemplateHandlers(store: TemplateStore, noteStore: NoteStore, locale: AppLocale) {
  const messages = getMessages(locale)

  ipcMain.removeHandler("templates:list")
  ipcMain.removeHandler("templates:get")
  ipcMain.removeHandler("templates:createFromNote")
  ipcMain.removeHandler("templates:update")
  ipcMain.removeHandler("templates:delete")

  ipcMain.handle("templates:list", async () => {
    return store.list()
  })

  ipcMain.handle("templates:get", async (_event, id: string) => {
    return store.get(id)
  })

  ipcMain.handle("templates:createFromNote", async (_event, noteId: string, payload: SaveTemplateInput) => {
    const note = await noteStore.get(noteId)

    if (!note) {
      throw new Error(messages.errors.noteNotFound(noteId))
    }

    return store.createFromNote(note, payload)
  })

  ipcMain.handle("templates:update", async (_event, id: string, payload: SaveTemplateInput) => {
    return store.update(id, payload)
  })

  ipcMain.handle("templates:delete", async (_event, id: string) => {
    return store.delete(id)
  })
}
