import { ipcMain } from "electron"
import type { LlmStreamChatParams } from "../../../src/shared/llm"
import { LlmInferenceService } from "../services/llm-inference"

export function registerLlmInferenceHandlers(service: LlmInferenceService) {
  ipcMain.removeHandler("llm:startStreamChat")
  ipcMain.removeHandler("llm:cancelStream")

  ipcMain.handle("llm:startStreamChat", async (event, params: LlmStreamChatParams) => {
    return service.startStreamChat(event.sender, params)
  })

  ipcMain.handle("llm:cancelStream", async (_event, streamId: string) => {
    await service.cancelStream(streamId)
  })
}
