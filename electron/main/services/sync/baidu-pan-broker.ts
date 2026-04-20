import {
  DEFAULT_BAIDU_PAN_AUTH_BROKER_URL,
  type BaiduPanAuthResult,
} from "../../../../src/shared/sync"
import { SyncAuthError, SyncNetworkError } from "./providers/types"

interface BrokerErrorPayload {
  error?: string
}

export class BaiduPanBrokerClient {
  private readonly baseUrl: string | null

  constructor(baseUrl = process.env.METIS_BAIDU_PAN_AUTH_BROKER_URL ?? DEFAULT_BAIDU_PAN_AUTH_BROKER_URL) {
    this.baseUrl = this.normalizeBaseUrl(baseUrl)
  }

  getBaseUrl(): string | null {
    return this.baseUrl
  }

  buildAuthorizeUrl(state: string, callbackUrl: string): string {
    const baseUrl = this.requireBaseUrl()
    const url = new URL("/oauth/baidu-pan/start", `${baseUrl}/`)
    url.searchParams.set("state", state)
    url.searchParams.set("callback_url", callbackUrl)
    return url.toString()
  }

  async exchangeBrokerCode(brokerCode: string): Promise<BaiduPanAuthResult> {
    return this.postJson("/oauth/baidu-pan/exchange", { brokerCode })
  }

  async refreshTokens(refreshToken: string): Promise<BaiduPanAuthResult> {
    return this.postJson("/oauth/baidu-pan/refresh", { refreshToken })
  }

  private normalizeBaseUrl(rawValue: string | null | undefined): string | null {
    const value = rawValue?.trim()

    if (!value) {
      return null
    }

    const url = new URL(value)
    return url.toString().replace(/\/$/, "")
  }

  private requireBaseUrl(): string {
    if (!this.baseUrl) {
      throw new SyncAuthError(
        "Baidu Pan auth broker is not configured. Set METIS_BAIDU_PAN_AUTH_BROKER_URL or run the local broker service.",
      )
    }

    return this.baseUrl
  }

  private async postJson(pathname: string, payload: Record<string, string>): Promise<BaiduPanAuthResult> {
    const baseUrl = this.requireBaseUrl()
    const response = await fetch(new URL(pathname, `${baseUrl}/`).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const contentType = response.headers.get("content-type") ?? ""
    const body = contentType.includes("application/json")
      ? ((await response.json()) as BaiduPanAuthResult | BrokerErrorPayload)
      : ({ error: await response.text() } as BrokerErrorPayload)

    if (!response.ok) {
      const message = "error" in body && body.error ? body.error : `HTTP ${response.status}`
      throw new SyncNetworkError(`Baidu Pan auth broker request failed: ${message}`)
    }

    return body as BaiduPanAuthResult
  }
}