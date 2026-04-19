import path from "node:path"
import { fileURLToPath } from "node:url"
import { app, BrowserWindow, protocol, shell } from "electron"
import { ASSET_PROTOCOL } from "../../src/shared/assets"
import { APP_NAME, resolveLocale } from "../../src/shared/i18n"
import { registerAssetHandlers } from "./ipc/assets"
import { registerLlmInferenceHandlers } from "./ipc/llm-inference"
import { registerLlmModelHandlers } from "./ipc/llm-models"
import { registerNoteLinkHandlers } from "./ipc/note-links"
import { registerNoteHandlers } from "./ipc/notes"
import { registerTemplateHandlers } from "./ipc/templates"
import { registerVersionHandlers } from "./ipc/versions"
import { AssetStore } from "./services/asset-store"
import { LlmInferenceService } from "./services/llm-inference"
import { LocalModelManager } from "./services/local-model-manager"
import { LlmModelStore } from "./services/llm-model-store"
import { NoteLinkStore } from "./services/note-link-store"
import { NoteStore } from "./services/note-store"
import { TemplateStore } from "./services/template-store"
import { VersionStore } from "./services/version-store"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

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
    icon: path.join(__dirname, "../dist/logo.svg"),
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
  const settingsBaseDir = path.join(app.getPath("userData"), "metis-note-settings")

  const noteLinkStore = new NoteLinkStore(notesBaseDir)
  const assetStore = new AssetStore(notesBaseDir, locale)
  const versionStore = new VersionStore(notesBaseDir, locale)
  const templateStore = new TemplateStore(settingsBaseDir, locale, assetStore)
  const store = new NoteStore(notesBaseDir, locale, noteLinkStore, assetStore, versionStore)
  const llmModelStore = new LlmModelStore(settingsBaseDir, locale)
  const localModelManager = new LocalModelManager(path.join(app.getPath("userData"), "metis-note-models"), llmModelStore)
  const llmInference = new LlmInferenceService(llmModelStore, localModelManager, locale)
  await store.ensureReady()
  await assetStore.ensureReady()
  await versionStore.ensureReady()
  await templateStore.ensureReady()
  await llmModelStore.ensureReady()
  await localModelManager.ensureReady()
  void versionStore.pruneAll().catch((error) => {
    console.error("[metis-note] Failed to prune note versions.", error)
  })
  protocol.handle(ASSET_PROTOCOL, (request) => assetStore.handleProtocolRequest(request))
  registerNoteHandlers(store, assetStore, templateStore, locale)
  registerNoteLinkHandlers(store, noteLinkStore)
  registerVersionHandlers(store, versionStore, locale)
  registerTemplateHandlers(templateStore, store, locale)
  registerAssetHandlers(assetStore)
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
