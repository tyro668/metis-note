import path from "node:path"
import { fileURLToPath } from "node:url"
import { app, BrowserWindow, protocol, shell } from "electron"
import { ASSET_PROTOCOL } from "../../src/shared/assets"
import { APP_NAME, resolveLocale } from "../../src/shared/i18n"
import { registerAppUpdateHandlers } from "./ipc/app-updates"
import { registerAssetHandlers } from "./ipc/assets"
import { registerLlmInferenceHandlers } from "./ipc/llm-inference"
import { registerLlmModelHandlers } from "./ipc/llm-models"
import { registerNoteLinkHandlers } from "./ipc/note-links"
import { registerNoteHandlers } from "./ipc/notes"
import { registerTemplateHandlers } from "./ipc/templates"
import { registerVersionHandlers } from "./ipc/versions"
import { registerSyncHandlers } from "./ipc/sync"
import { AssetStore } from "./services/asset-store"
import { AppUpdaterService } from "./services/app-updater"
import { LlmInferenceService } from "./services/llm-inference"
import { LocalModelManager } from "./services/local-model-manager"
import { LlmModelStore } from "./services/llm-model-store"
import { NoteLinkStore } from "./services/note-link-store"
import { NoteStore } from "./services/note-store"
import { TemplateStore } from "./services/template-store"
import { VersionStore } from "./services/version-store"
import { SyncManager } from "./services/sync/sync-manager"
import { BaiduPanAuthService } from "./services/sync/baidu-pan-auth"
import { BaiduPanBrokerClient } from "./services/sync/baidu-pan-broker"
import { GoogleDriveAuthService } from "./services/sync/google-drive-auth"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (process.platform === "darwin") {
  // On macOS, Chromium's GPU process can become unstable while a local llama runtime
  // is using Metal at the same time. Run the renderer without hardware acceleration
  // so AI write does not take the whole window down.
  app.disableHardwareAcceleration()
}

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

function resolveWindowIconPath() {
  if (process.platform === "darwin") {
    return undefined
  }

  if (app.isPackaged) {
    return process.platform === "win32"
      ? path.join(process.resourcesPath, "app", "assets", "icon.ico")
      : path.join(process.resourcesPath, "app", "assets", "logo.svg")
  }

  return process.platform === "win32"
    ? path.join(process.cwd(), "public", "icon.ico")
    : path.join(process.cwd(), "public", "logo.svg")
}

async function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#f6efe5",
    title: APP_NAME,
    icon: resolveWindowIconPath(),
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

    if (!currentUrl) {
      return
    }

    event.preventDefault()

    if (isSupportedExternalUrl(url)) {
      void shell.openExternal(url)
    }
  })

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[metis-note] Renderer process gone:", details.reason)

    if (details.reason !== "clean-exit") {
      mainWindow.webContents.reload()
    }
  })

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error("[metis-note] Failed to load:", errorCode, errorDescription)
    mainWindow.webContents.reload()
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
  const appUpdater = new AppUpdaterService()
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
  registerNoteHandlers(store, assetStore, locale)
  registerNoteLinkHandlers(store, noteLinkStore)
  registerVersionHandlers(store, versionStore, locale)
  registerTemplateHandlers(templateStore, store, locale)
  registerAssetHandlers(assetStore)
  registerAppUpdateHandlers(appUpdater)
  registerLlmModelHandlers(llmModelStore, localModelManager)
  registerLlmInferenceHandlers(llmInference)
  const baiduPanBrokerClient = new BaiduPanBrokerClient()
  const googleDriveAuthService = new GoogleDriveAuthService()
  const syncManager = new SyncManager(notesBaseDir, baiduPanBrokerClient, googleDriveAuthService)
  const baiduPanAuthService = new BaiduPanAuthService(baiduPanBrokerClient)
  await syncManager.initialize()
  registerSyncHandlers(syncManager, store, baiduPanAuthService, googleDriveAuthService)
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
