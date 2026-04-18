import path from "node:path"
import { fileURLToPath } from "node:url"
import { app, BrowserWindow, shell } from "electron"
import { APP_NAME, resolveLocale } from "../../src/shared/i18n"
import { registerLlmInferenceHandlers } from "./ipc/llm-inference"
import { registerLlmModelHandlers } from "./ipc/llm-models"
import { registerNoteLinkHandlers } from "./ipc/note-links"
import { registerNoteHandlers } from "./ipc/notes"
import { LlmInferenceService } from "./services/llm-inference"
import { LocalModelManager } from "./services/local-model-manager"
import { LlmModelStore } from "./services/llm-model-store"
import { NoteLinkStore } from "./services/note-link-store"
import { NoteStore } from "./services/note-store"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function isSupportedExternalUrl(value: string) {
  try {
    const protocol = new URL(value).protocol

    return protocol === "http:" || protocol === "https:" || protocol === "mailto:" || protocol === "tel:"
  } catch {
    return false
  }
}

async function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#f6efe5",
    title: APP_NAME,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSupportedExternalUrl(url)) {
      void shell.openExternal(url)
    }

    return { action: "deny" }
  })

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentUrl = mainWindow.webContents.getURL()

    if (!currentUrl || url === currentUrl) {
      return
    }

    event.preventDefault()

    if (isSupportedExternalUrl(url)) {
      void shell.openExternal(url)
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../dist/index.html"))
  }
}

async function bootstrap() {
  app.setName(APP_NAME)
  const locale = resolveLocale(app.getLocale())
  const notesBaseDir = path.join(app.getPath("userData"), "metis-note-store")

  const noteLinkStore = new NoteLinkStore(notesBaseDir)
  const store = new NoteStore(notesBaseDir, locale, noteLinkStore)
  const llmModelStore = new LlmModelStore(path.join(app.getPath("userData"), "metis-note-settings"), locale)
  const localModelManager = new LocalModelManager(path.join(app.getPath("userData"), "metis-note-models"), llmModelStore)
  const llmInference = new LlmInferenceService(llmModelStore, localModelManager, locale)
  await store.ensureReady()
  await llmModelStore.ensureReady()
  await localModelManager.ensureReady()
  registerNoteHandlers(store, locale)
  registerNoteLinkHandlers(store, noteLinkStore)
  registerLlmModelHandlers(llmModelStore, localModelManager)
  registerLlmInferenceHandlers(llmInference)
  await createMainWindow()

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow()
    }
  })

  app.on("before-quit", () => {
    llmInference.shutdown()
    void localModelManager.shutdown()
  })
}

app.whenReady().then(bootstrap).catch((error) => {
  console.error("[metis-note] Failed to initialize the Electron main process.", error)
  app.exit(1)
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
