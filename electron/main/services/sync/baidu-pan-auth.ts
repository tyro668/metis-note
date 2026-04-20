import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"

import { shell } from "electron"

import {
  BAIDU_PAN_LOCAL_CALLBACK_URL,
  type BaiduPanAuthResult,
} from "../../../../src/shared/sync"
import { SyncAuthError, SyncNetworkError } from "./providers/types"
import { BaiduPanBrokerClient } from "./baidu-pan-broker"

const AUTH_TIMEOUT_MS = 3 * 60 * 1000
const CALLBACK_URL = new URL(BAIDU_PAN_LOCAL_CALLBACK_URL)
const CALLBACK_HOST = CALLBACK_URL.hostname
const CALLBACK_PORT = Number(CALLBACK_URL.port)
const CALLBACK_PATH = CALLBACK_URL.pathname

export class BaiduPanAuthService {
  private pendingAuth: Promise<BaiduPanAuthResult> | null = null

  constructor(private readonly brokerClient: BaiduPanBrokerClient) {}

  async authorize(): Promise<BaiduPanAuthResult> {
    if (this.pendingAuth) {
      throw new SyncAuthError("Baidu Pan authorization is already in progress")
    }

    this.pendingAuth = this.authorizeInternal()

    try {
      return await this.pendingAuth
    } finally {
      this.pendingAuth = null
    }
  }

  private async authorizeInternal(): Promise<BaiduPanAuthResult> {
    const state = randomUUID()
    const server = createServer()

    try {
      const callbackUrl = await this.listenForCallback(server)
      await this.openAuthorizationPage(state, callbackUrl)
      return await this.waitForCallback(server, state)
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
    }
  }

  private async listenForCallback(server: ReturnType<typeof createServer>): Promise<string> {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(CALLBACK_PORT, CALLBACK_HOST, () => {
        server.off("error", reject)
        resolve()
      })
    })

    const address = server.address()

    if (!address || typeof address === "string") {
      throw new SyncNetworkError("Failed to start local callback server for Baidu Pan authorization")
    }

    const port = (address as AddressInfo).port

    if (port !== CALLBACK_PORT) {
      throw new SyncNetworkError("Baidu Pan authorization callback port is unavailable")
    }

    return BAIDU_PAN_LOCAL_CALLBACK_URL
  }

  private async openAuthorizationPage(state: string, callbackUrl: string): Promise<void> {
    const authUrl = this.brokerClient.buildAuthorizeUrl(state, callbackUrl)
    await shell.openExternal(authUrl.toString())
  }

  private async waitForCallback(
    server: ReturnType<typeof createServer>,
    expectedState: string,
  ): Promise<BaiduPanAuthResult> {
    return await new Promise<BaiduPanAuthResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new SyncAuthError("Timed out waiting for Baidu Pan authorization"))
      }, AUTH_TIMEOUT_MS)

      const cleanup = () => {
        clearTimeout(timeout)
        server.removeListener("request", onRequest)
      }

      const onRequest = async (request: IncomingMessage, response: ServerResponse) => {
        try {
          const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`)

          if (requestUrl.pathname !== CALLBACK_PATH) {
            this.respondHtml(response, 404, "请求路径无效，可以关闭此页面返回应用。")
            return
          }

          const error = requestUrl.searchParams.get("error")
          if (error) {
            cleanup()
            this.respondHtml(response, 400, "百度网盘授权已取消，可以关闭此页面返回应用。")
            reject(new SyncAuthError(`Baidu Pan authorization failed: ${error}`))
            return
          }

          const brokerCode = requestUrl.searchParams.get("broker_code")
          const state = requestUrl.searchParams.get("state")

          if (!brokerCode || state !== expectedState) {
            cleanup()
            this.respondHtml(response, 400, "授权结果无效，可以关闭此页面后重新发起授权。")
            reject(new SyncAuthError("Baidu Pan authorization returned an invalid callback"))
            return
          }

          const tokenResult = await this.brokerClient.exchangeBrokerCode(brokerCode)
          cleanup()
          this.respondHtml(response, 200, "百度网盘授权成功，可以关闭此页面返回应用。")
          resolve(tokenResult)
        } catch (error) {
          cleanup()
          this.respondHtml(response, 500, "授权处理失败，请关闭页面后重试。")
          reject(error)
        }
      }

      server.on("request", onRequest)
    })
  }

  private respondHtml(response: ServerResponse, statusCode: number, message: string): void {
    response.writeHead(statusCode, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    })
    response.end(`<!doctype html><html><head><meta charset="utf-8"><title>Metis Note</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6efe5;color:#1f3045;padding:40px;line-height:1.7}main{max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7ebf1;border-radius:20px;padding:28px 32px;box-shadow:0 12px 32px rgba(15,23,42,.08)}h1{font-size:22px;margin:0 0 12px}p{margin:0;color:#526072}</style></head><body><main><h1>Metis Note</h1><p>${message}</p></main></body></html>`)
  }
}