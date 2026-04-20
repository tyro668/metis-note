import { createHash, randomBytes, randomUUID } from "node:crypto"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"

import { shell } from "electron"

import {
  GOOGLE_DRIVE_LOCAL_CALLBACK_URL,
  type GoogleDriveAuthResult,
} from "../../../../src/shared/sync"
import { SyncAuthError, SyncNetworkError } from "./providers/types"

const AUTH_TIMEOUT_MS = 3 * 60 * 1000
const CALLBACK_URL = new URL(GOOGLE_DRIVE_LOCAL_CALLBACK_URL)
const CALLBACK_HOST = CALLBACK_URL.hostname
const CALLBACK_PORT = Number(CALLBACK_URL.port)
const CALLBACK_PATH = CALLBACK_URL.pathname
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_USER_INFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
const GOOGLE_DRIVE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.appdata",
]

interface GoogleTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface GoogleUserInfoResponse {
  sub?: string
  email?: string
  name?: string
}

export class GoogleDriveAuthService {
  private pendingAuth: Promise<GoogleDriveAuthResult> | null = null

  async authorize(clientId: string): Promise<GoogleDriveAuthResult> {
    const normalizedClientId = clientId.trim()

    if (!normalizedClientId) {
      throw new SyncAuthError("Google Drive client ID is required")
    }

    if (this.pendingAuth) {
      throw new SyncAuthError("Google Drive authorization is already in progress")
    }

    this.pendingAuth = this.authorizeInternal(normalizedClientId)

    try {
      return await this.pendingAuth
    } finally {
      this.pendingAuth = null
    }
  }

  async refreshTokens(clientId: string, refreshToken: string): Promise<GoogleDriveAuthResult> {
    const normalizedClientId = clientId.trim()
    const normalizedRefreshToken = refreshToken.trim()

    if (!normalizedClientId) {
      throw new SyncAuthError("Google Drive client ID is required")
    }

    if (!normalizedRefreshToken) {
      throw new SyncAuthError("Google Drive refresh token is missing")
    }

    const token = await this.exchangeToken(
      new URLSearchParams({
        client_id: normalizedClientId,
        refresh_token: normalizedRefreshToken,
        grant_type: "refresh_token",
      }),
    )

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? normalizedRefreshToken,
      expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    }
  }

  private async authorizeInternal(clientId: string): Promise<GoogleDriveAuthResult> {
    const state = randomUUID()
    const { codeVerifier, codeChallenge } = createPkcePair()
    const server = createServer()

    try {
      const callbackUrl = await this.listenForCallback(server)
      await this.openAuthorizationPage(clientId, state, codeChallenge, callbackUrl)
      return await this.waitForCallback(server, {
        clientId,
        expectedState: state,
        codeVerifier,
        redirectUri: callbackUrl,
      })
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
      throw new SyncNetworkError("Failed to start local callback server for Google Drive authorization")
    }

    const port = (address as AddressInfo).port

    if (port !== CALLBACK_PORT) {
      throw new SyncNetworkError("Google Drive authorization callback port is unavailable")
    }

    return GOOGLE_DRIVE_LOCAL_CALLBACK_URL
  }

  private async openAuthorizationPage(
    clientId: string,
    state: string,
    codeChallenge: string,
    callbackUrl: string,
  ): Promise<void> {
    const authUrl = new URL(GOOGLE_AUTHORIZE_URL)
    authUrl.searchParams.set("client_id", clientId)
    authUrl.searchParams.set("redirect_uri", callbackUrl)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("scope", GOOGLE_DRIVE_SCOPES.join(" "))
    authUrl.searchParams.set("access_type", "offline")
    authUrl.searchParams.set("prompt", "consent")
    authUrl.searchParams.set("state", state)
    authUrl.searchParams.set("code_challenge", codeChallenge)
    authUrl.searchParams.set("code_challenge_method", "S256")

    await shell.openExternal(authUrl.toString())
  }

  private async waitForCallback(
    server: ReturnType<typeof createServer>,
    options: {
      clientId: string
      expectedState: string
      codeVerifier: string
      redirectUri: string
    },
  ): Promise<GoogleDriveAuthResult> {
    return await new Promise<GoogleDriveAuthResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new SyncAuthError("Timed out waiting for Google Drive authorization"))
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
            this.respondHtml(response, 400, "Google Drive 授权已取消，可以关闭此页面返回应用。")
            reject(new SyncAuthError(`Google Drive authorization failed: ${error}`))
            return
          }

          const code = requestUrl.searchParams.get("code")
          const state = requestUrl.searchParams.get("state")

          if (!code || state !== options.expectedState) {
            cleanup()
            this.respondHtml(response, 400, "授权结果无效，可以关闭此页面后重新发起授权。")
            reject(new SyncAuthError("Google Drive authorization returned an invalid callback"))
            return
          }

          const tokenResult = await this.exchangeAuthorizationCode({
            clientId: options.clientId,
            code,
            codeVerifier: options.codeVerifier,
            redirectUri: options.redirectUri,
          })

          cleanup()
          this.respondHtml(response, 200, "Google Drive 授权成功，可以关闭此页面返回应用。")
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

  private async exchangeAuthorizationCode(input: {
    clientId: string
    code: string
    codeVerifier: string
    redirectUri: string
  }): Promise<GoogleDriveAuthResult> {
    const token = await this.exchangeToken(
      new URLSearchParams({
        client_id: input.clientId,
        code: input.code,
        code_verifier: input.codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: input.redirectUri,
      }),
    )

    if (!token.refresh_token) {
      throw new SyncAuthError("Google Drive authorization did not return a refresh token")
    }

    const profile = await this.fetchUserProfile(token.access_token)

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      accountEmail: profile.email ?? null,
      accountName: profile.name ?? null,
      userId: profile.sub ?? null,
    }
  }

  private async exchangeToken(params: URLSearchParams): Promise<Required<Pick<GoogleTokenResponse, "access_token" | "expires_in">> & GoogleTokenResponse> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    })

    const payload = (await response.json().catch(() => ({}))) as GoogleTokenResponse

    if (!response.ok) {
      const message = payload.error_description ?? payload.error ?? `HTTP ${response.status}`
      throw new SyncNetworkError(`Google Drive token request failed: ${message}`)
    }

    if (!payload.access_token || typeof payload.expires_in !== "number") {
      throw new SyncAuthError("Google Drive token response is missing required fields")
    }

    return payload as Required<Pick<GoogleTokenResponse, "access_token" | "expires_in">> & GoogleTokenResponse
  }

  private async fetchUserProfile(accessToken: string): Promise<GoogleUserInfoResponse> {
    try {
      const response = await fetch(GOOGLE_USER_INFO_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        return {}
      }

      return (await response.json()) as GoogleUserInfoResponse
    } catch {
      return {}
    }
  }

  private respondHtml(response: ServerResponse, statusCode: number, message: string): void {
    response.writeHead(statusCode, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    })
    response.end(`<!doctype html><html><head><meta charset="utf-8"><title>Metis Note</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6efe5;color:#1f3045;padding:40px;line-height:1.7}main{max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7ebf1;border-radius:20px;padding:28px 32px;box-shadow:0 12px 32px rgba(15,23,42,.08)}h1{font-size:22px;margin:0 0 12px}p{margin:0;color:#526072}</style></head><body><main><h1>Metis Note</h1><p>${message}</p></main></body></html>`)
  }
}

function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = toBase64Url(randomBytes(64))
  const codeChallenge = toBase64Url(createHash("sha256").update(codeVerifier).digest())

  return { codeVerifier, codeChallenge }
}

function toBase64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}
