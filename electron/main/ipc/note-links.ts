import { ipcMain } from "electron"
import { NoteStore } from "../services/note-store"
import { NoteLinkStore } from "../services/note-link-store"

export function registerNoteLinkHandlers(store: NoteStore, noteLinkStore: NoteLinkStore) {
  ipcMain.removeHandler("noteLinks:getBacklinks")
  ipcMain.removeHandler("noteLinks:resolveLinks")

  ipcMain.handle("noteLinks:getBacklinks", async (_event, noteId: string) => {
    const notes = await store.list()
    return noteLinkStore.getBacklinks(noteId, notes)
  })

  ipcMain.handle("noteLinks:resolveLinks", async (_event, noteIds: string[]) => {
    const notes = await store.list()
    return noteLinkStore.resolveLinks(noteIds, notes)
  })
}
