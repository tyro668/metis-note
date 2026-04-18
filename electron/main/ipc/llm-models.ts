import { ipcMain } from "electron"
import type { SaveLlmModelInput } from "../../../src/shared/llm"
import { LocalModelManager } from "../services/local-model-manager"
import { LlmModelStore } from "../services/llm-model-store"

export function registerLlmModelHandlers(store: LlmModelStore, localModelManager: LocalModelManager) {
  ipcMain.removeHandler("llmModels:list")
  ipcMain.removeHandler("llmModels:create")
  ipcMain.removeHandler("llmModels:addManagedLocal")
  ipcMain.removeHandler("llmModels:update")
  ipcMain.removeHandler("llmModels:enable")
  ipcMain.removeHandler("llmModels:delete")
  ipcMain.removeHandler("llmModels:testConnection")

  ipcMain.handle("llmModels:list", async () => {
    return store.list()
  })

  ipcMain.handle("llmModels:create", async (_event, payload: SaveLlmModelInput) => {
    return store.create(payload)
  })

  ipcMain.handle("llmModels:addManagedLocal", async (_event, modelId: string) => {
    return localModelManager.addManagedLocal(modelId)
  })

  ipcMain.handle("llmModels:update", async (_event, id: string, payload: SaveLlmModelInput) => {
    return store.update(id, payload)
  })

  ipcMain.handle("llmModels:enable", async (_event, id: string) => {
    const model = await store.get(id)

    if (model?.configType === "managed-local") {
      return localModelManager.activateManagedLocalByConfigId(id)
    }

    await localModelManager.stopIfManagedLocalEnabled(id)
    return store.enable(id)
  })

  ipcMain.handle("llmModels:delete", async (_event, id: string) => {
    const model = await store.get(id)

    if (model?.configType === "managed-local") {
      return localModelManager.deleteManagedLocalByConfigId(id)
    }

    return store.delete(id)
  })

  ipcMain.handle("llmModels:testConnection", async (_event, id: string) => {
    return store.testConnection(id)
  })
}
