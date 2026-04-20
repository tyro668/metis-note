import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions, type SaveDialogOptions } from "electron"
import { getMessages, type AppLocale } from "../../../src/shared/i18n"
import type { CreateNoteInput, UpdateNoteInput } from "../../../src/shared/notes"
import { defaultExportPath, documentFromMarkdown, fallbackTitleFromPath, noteToMarkdown } from "../services/note-markdown"
import { AssetStore } from "../services/asset-store"
import { NoteStore } from "../services/note-store"

export function registerNoteHandlers(store: NoteStore, assetStore: AssetStore, locale: AppLocale) {
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
  ipcMain.removeHandler("notes:exportPdf")
  ipcMain.removeHandler("notes:print")

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
    const created = await store.create({
      ...(payload ?? {}),
      ...documentFromMarkdown(source, fallbackTitleFromPath(filePath)),
    })
    const importedContent = await assetStore.importContentAssets(created.id, created.content, path.dirname(filePath))
    const imported =
      JSON.stringify(importedContent) === JSON.stringify(created.content)
        ? created
        : await store.update(created.id, {
            content: importedContent,
            plainText: created.plainText,
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

    const exportDir = path.join(
      path.dirname(result.filePath),
      `${path.basename(result.filePath, path.extname(result.filePath))}_assets`,
    )
    const exportedAssets = await assetStore.exportReferencedAssets(note.content, exportDir)

    await writeFile(
      result.filePath,
      noteToMarkdown(note, {
        resolveAssetSource: (source) => exportedAssets.get(source) ?? source,
      }),
      "utf-8",
    )

    return {
      filePath: result.filePath,
    }
  })

  ipcMain.handle("notes:exportPdf", async (event, id: string) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const note = await store.get(id)

    if (!note) {
      throw new Error(messages.errors.noteNotFound(id))
    }

    const defaultPath = defaultExportPath(note.title).replace(/\.md$/i, ".pdf")
    const dialogOptions: SaveDialogOptions = {
      title: messages.dialogs.exportPdfTitle,
      defaultPath,
      filters: [
        {
          name: messages.dialogs.pdfFilterName,
          extensions: ["pdf"],
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

    await event.sender.executeJavaScript("window.scrollTo(0, 0)")
    const pdfData = await event.sender.printToPDF({
      pageSize: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    })

    await writeFile(result.filePath, pdfData)

    return {
      filePath: result.filePath,
    }
  })

  ipcMain.handle("notes:print", async (event, id: string) => {
    const note = await store.get(id)

    if (!note) {
      throw new Error(messages.errors.noteNotFound(id))
    }

    await event.sender.executeJavaScript("window.scrollTo(0, 0)")

    await new Promise<void>((resolve, reject) => {
      event.sender.print(
        {
          printBackground: true,
        },
        (success, failureReason) => {
          if (success) {
            resolve()
            return
          }

          reject(new Error(failureReason || messages.errors.printFailed))
        },
      )
    })
  })
}
