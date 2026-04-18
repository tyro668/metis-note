import { readFile, writeFile } from "node:fs/promises"
import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions, type SaveDialogOptions } from "electron"
import { getMessages, type AppLocale } from "../../../src/shared/i18n"
import type { CreateNoteInput, UpdateNoteInput } from "../../../src/shared/notes"
import { defaultExportPath, documentFromMarkdown, fallbackTitleFromPath, noteToMarkdown } from "../services/note-markdown"
import { NoteStore } from "../services/note-store"

export function registerNoteHandlers(store: NoteStore, locale: AppLocale) {
  const messages = getMessages(locale)
  ipcMain.removeHandler("notes:list")
  ipcMain.removeHandler("notes:get")
  ipcMain.removeHandler("notes:create")
  ipcMain.removeHandler("notes:update")
  ipcMain.removeHandler("notes:trash")
  ipcMain.removeHandler("notes:restore")
  ipcMain.removeHandler("notes:duplicate")
  ipcMain.removeHandler("notes:deleteForever")
  ipcMain.removeHandler("notes:importMarkdown")
  ipcMain.removeHandler("notes:exportMarkdown")

  ipcMain.handle("notes:list", async () => {
    return store.list()
  })

  ipcMain.handle("notes:get", async (_event, id: string) => {
    return store.get(id)
  })

  ipcMain.handle("notes:create", async (_event, payload?: CreateNoteInput) => {
    return store.create(payload)
  })

  ipcMain.handle("notes:update", async (_event, id: string, payload: UpdateNoteInput) => {
    return store.update(id, payload)
  })

  ipcMain.handle("notes:trash", async (_event, id: string) => {
    return store.moveToTrash(id)
  })

  ipcMain.handle("notes:restore", async (_event, id: string) => {
    return store.restore(id)
  })

  ipcMain.handle("notes:duplicate", async (_event, id: string) => {
    return store.duplicate(id)
  })

  ipcMain.handle("notes:deleteForever", async (_event, id: string) => {
    return store.deleteForever(id)
  })

  ipcMain.handle("notes:importMarkdown", async (event, payload?: CreateNoteInput) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const dialogOptions: OpenDialogOptions = {
      title: messages.dialogs.importTitle,
      properties: ["openFile"],
      filters: [
        {
          name: messages.dialogs.markdownTextFilterName,
          extensions: ["md", "markdown", "txt"],
        },
      ],
    }
    const selection = parentWindow
      ? await dialog.showOpenDialog(parentWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (selection.canceled || selection.filePaths.length === 0) {
      return {
        filePath: null,
        note: null,
      }
    }

    const filePath = selection.filePaths[0]
    const source = await readFile(filePath, "utf-8")
    const imported = await store.create({
      ...(payload ?? {}),
      ...documentFromMarkdown(source, fallbackTitleFromPath(filePath)),
    })

    return {
      filePath,
      note: imported,
    }
  })

  ipcMain.handle("notes:exportMarkdown", async (event, id: string) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const note = await store.get(id)

    if (!note) {
      throw new Error(messages.errors.noteNotFound(id))
    }

    const dialogOptions: SaveDialogOptions = {
      title: messages.dialogs.exportTitle,
      defaultPath: defaultExportPath(note.title),
      filters: [
        {
          name: messages.dialogs.markdownFilterName,
          extensions: ["md"],
        },
      ],
    }
    const result = parentWindow
      ? await dialog.showSaveDialog(parentWindow, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions)

    if (result.canceled || !result.filePath) {
      return {
        filePath: null,
      }
    }

    await writeFile(result.filePath, noteToMarkdown(note), "utf-8")

    return {
      filePath: result.filePath,
    }
  })
}
