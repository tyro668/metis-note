import path from "node:path"

import {
  DEFAULT_GOOGLE_DRIVE_REMOTE_PATH,
  type GoogleDriveAuthResult,
  type GoogleDriveConfig,
} from "../../../../../src/shared/sync"
import type { CloudStorageProvider, RemoteFileInfo, UploadOptions } from "./types"
import {
  SyncAuthError,
  SyncFileNotFoundError,
  SyncNetworkError,
  SyncQuotaError,
} from "./types"

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3"
const DRIVE_APP_DATA_SPACE = "appDataFolder"
const PATH_PROPERTY_KEY = "metisNotePath"
const INDEX_CACHE_TTL_MS = 5_000
const INDEX_PAGE_SIZE = 1_000
const ACCESS_TOKEN_REFRESH_WINDOW_MS = 60_000
const FILE_FIELDS = "files(id,name,size,modifiedTime,mimeType,appProperties),nextPageToken"
const SINGLE_FILE_FIELDS = "id,name,size,modifiedTime,mimeType,appProperties"

interface GoogleDriveFile {
  id: string
  name?: string
  size?: string
  modifiedTime?: string
  mimeType?: string
  appProperties?: Record<string, string>
}

interface GoogleDriveListResponse {
  files?: GoogleDriveFile[]
  nextPageToken?: string
}

interface GoogleDriveErrorPayload {
  error?: {
    message?: string
    errors?: Array<{
      reason?: string
    }>
  }
}

interface GoogleDriveProviderOptions {
  refreshTokens?: (clientId: string, refreshToken: string) => Promise<GoogleDriveAuthResult>
  onTokenRefreshed?: (config: GoogleDriveConfig) => void
}

export class GoogleDriveProvider implements CloudStorageProvider {
  readonly type = "google-drive" as const
  private config: GoogleDriveConfig
  private refreshTokens: ((clientId: string, refreshToken: string) => Promise<GoogleDriveAuthResult>) | null
  private onTokenRefreshed: ((config: GoogleDriveConfig) => void) | null
  private indexCache = new Map<string, GoogleDriveFile>()
  private cacheLoadedAt = 0

  constructor(config: GoogleDriveConfig, options: GoogleDriveProviderOptions = {}) {
    this.config = config
    this.refreshTokens = options.refreshTokens ?? null
    this.onTokenRefreshed = options.onTokenRefreshed ?? null
  }

  async initialize(): Promise<void> {
    if (!this.config.clientId || !this.config.accessToken || !this.config.refreshToken) {
      throw new SyncAuthError("Google Drive authorization is required before syncing")
    }

    const connected = await this.checkConnection()

    if (!connected) {
      throw new SyncAuthError("Failed to connect to Google Drive")
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.ensureIndex(true)
      return true
    } catch {
      return false
    }
  }

  async upload(remotePath: string, data: Buffer, _options?: UploadOptions): Promise<void> {
    const storedPath = this.toStoredPath(remotePath)
    const existing = await this.findRecordByStoredPath(storedPath)

    if (existing) {
      const updated = await this.updateFile(existing.id, data)
      this.indexCache.set(storedPath, updated)
      return
    }

    const created = await this.createFile(storedPath, data)
    this.indexCache.set(storedPath, created)
    this.cacheLoadedAt = Date.now()
  }

  async download(remotePath: string): Promise<Buffer> {
    const record = await this.requireRecord(remotePath)
    const response = await this.request(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(record.id)}?alt=media`,
    )

    return Buffer.from(await response.arrayBuffer())
  }

  async list(remoteDir: string, recursive = false): Promise<RemoteFileInfo[]> {
    await this.ensureIndex()

    const baseDir = normalizeDir(remoteDir)
    const prefix = this.toStoredPrefix(baseDir)
    const entries = new Map<string, RemoteFileInfo>()

    for (const [storedPath, record] of this.indexCache.entries()) {
      if (!storedPath.startsWith(prefix)) {
        continue
      }

      const relativePath = this.toRelativePath(storedPath)
      const remainder = relativePath.slice(baseDir.length)

      if (!remainder) {
        continue
      }

      if (recursive) {
        entries.set(relativePath, this.toFileInfo(relativePath, record))
        continue
      }

      const slashIndex = remainder.indexOf("/")

      if (slashIndex === -1) {
        entries.set(relativePath, this.toFileInfo(relativePath, record))
        continue
      }

      const directoryPath = `${baseDir}${remainder.slice(0, slashIndex + 1)}`

      entries.set(directoryPath, {
        path: directoryPath,
        size: 0,
        lastModified: "",
        isDirectory: true,
      })
    }

    return [...entries.values()].sort((left, right) => left.path.localeCompare(right.path))
  }

  async delete(remotePath: string): Promise<void> {
    const storedPath = this.toStoredPath(remotePath)
    const record = await this.findRecordByStoredPath(storedPath)

    if (!record) {
      return
    }

    await this.request(`${DRIVE_API_BASE}/files/${encodeURIComponent(record.id)}`, {
      method: "DELETE",
    })

    this.indexCache.delete(storedPath)
    this.cacheLoadedAt = Date.now()
  }

  async deleteBatch(remotePaths: string[]): Promise<void> {
    for (const remotePath of remotePaths) {
      await this.delete(remotePath)
    }
  }

  async exists(remotePath: string): Promise<boolean> {
    return (await this.findRecordByStoredPath(this.toStoredPath(remotePath))) !== null
  }

  async getMetadata(remotePath: string): Promise<RemoteFileInfo | null> {
    const record = await this.findRecordByStoredPath(this.toStoredPath(remotePath))

    if (!record) {
      return null
    }

    return this.toFileInfo(normalizeFilePath(remotePath), record)
  }

  async refreshAuth(): Promise<boolean> {
    if (!this.config.clientId || !this.config.refreshToken || !this.refreshTokens) {
      return false
    }

    try {
      const refreshed = await this.refreshTokens(this.config.clientId, this.config.refreshToken)
      this.config = {
        ...this.config,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
        accountEmail: refreshed.accountEmail ?? this.config.accountEmail ?? null,
        accountName: refreshed.accountName ?? this.config.accountName ?? null,
        userId: refreshed.userId ?? this.config.userId ?? null,
      }

      this.onTokenRefreshed?.(this.config)
      return true
    } catch {
      return false
    }
  }

  async dispose(): Promise<void> {
    this.indexCache.clear()
    this.cacheLoadedAt = 0
  }

  private async ensureIndex(force = false): Promise<void> {
    const cacheFresh = Date.now() - this.cacheLoadedAt < INDEX_CACHE_TTL_MS

    if (!force && this.indexCache.size > 0 && cacheFresh) {
      return
    }

    const nextCache = new Map<string, GoogleDriveFile>()
    let pageToken: string | undefined

    do {
      const url = new URL(`${DRIVE_API_BASE}/files`)
      url.searchParams.set("spaces", DRIVE_APP_DATA_SPACE)
      url.searchParams.set("pageSize", String(INDEX_PAGE_SIZE))
      url.searchParams.set("fields", FILE_FIELDS)
      url.searchParams.set("q", "trashed = false")

      if (pageToken) {
        url.searchParams.set("pageToken", pageToken)
      }

      const payload = await this.requestJson<GoogleDriveListResponse>(url.toString())

      for (const file of payload.files ?? []) {
        const storedPath = file.appProperties?.[PATH_PROPERTY_KEY]

        if (!storedPath || !storedPath.startsWith(this.namespacePrefix())) {
          continue
        }

        nextCache.set(storedPath, file)
      }

      pageToken = payload.nextPageToken
    } while (pageToken)

    this.indexCache = nextCache
    this.cacheLoadedAt = Date.now()
  }

  private async findRecordByStoredPath(storedPath: string): Promise<GoogleDriveFile | null> {
    await this.ensureIndex()

    const cached = this.indexCache.get(storedPath)

    if (cached) {
      return cached
    }

    const url = new URL(`${DRIVE_API_BASE}/files`)
    url.searchParams.set("spaces", DRIVE_APP_DATA_SPACE)
    url.searchParams.set("pageSize", "1")
    url.searchParams.set("fields", FILE_FIELDS)
    url.searchParams.set(
      "q",
      `trashed = false and appProperties has { key='${PATH_PROPERTY_KEY}' and value='${escapeDriveQueryValue(storedPath)}' }`,
    )

    const payload = await this.requestJson<GoogleDriveListResponse>(url.toString())
    const record = payload.files?.[0] ?? null

    if (record) {
      this.indexCache.set(storedPath, record)
      this.cacheLoadedAt = Date.now()
    }

    return record
  }

  private async requireRecord(remotePath: string): Promise<GoogleDriveFile> {
    const record = await this.findRecordByStoredPath(this.toStoredPath(remotePath))

    if (!record) {
      throw new SyncFileNotFoundError(remotePath)
    }

    return record
  }

  private async createFile(storedPath: string, data: Buffer): Promise<GoogleDriveFile> {
    const boundary = `metis-note-${Date.now().toString(36)}`
    const metadata = JSON.stringify({
      name: this.createDriveFileName(storedPath),
      parents: [DRIVE_APP_DATA_SPACE],
      appProperties: {
        [PATH_PROPERTY_KEY]: storedPath,
      },
    })

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}--`),
    ])

    return await this.requestJson<GoogleDriveFile>(
      `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=${encodeURIComponent(SINGLE_FILE_FIELDS)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: new Uint8Array(body),
      },
    )
  }

  private async updateFile(fileId: string, data: Buffer): Promise<GoogleDriveFile> {
    return await this.requestJson<GoogleDriveFile>(
      `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=${encodeURIComponent(SINGLE_FILE_FIELDS)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(data),
      },
    )
  }

  private async requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.request(url, init)
    return (await response.json()) as T
  }

  private async request(url: string, init: RequestInit = {}, allowRetry = true): Promise<Response> {
    await this.refreshAccessTokenIfNeeded()

    const headers = new Headers(init.headers)
    headers.set("Authorization", `Bearer ${this.config.accessToken}`)

    const response = await fetch(url, {
      ...init,
      headers,
    })

    if (response.status === 401) {
      if (allowRetry && (await this.refreshAuth())) {
        return await this.request(url, init, false)
      }

      throw new SyncAuthError("Google Drive authentication expired")
    }

    if (!response.ok) {
      throw await this.wrapResponseError(response)
    }

    return response
  }

  private async refreshAccessTokenIfNeeded(): Promise<void> {
    if (!this.config.expiresAt) {
      return
    }

    const expiresAt = Date.parse(this.config.expiresAt)

    if (!Number.isFinite(expiresAt)) {
      return
    }

    if (expiresAt - Date.now() > ACCESS_TOKEN_REFRESH_WINDOW_MS) {
      return
    }

    const refreshed = await this.refreshAuth()

    if (!refreshed && !this.config.accessToken) {
      throw new SyncAuthError("Google Drive authentication expired")
    }
  }

  private async wrapResponseError(response: Response): Promise<Error> {
    let message = `Google Drive API error: ${response.status}`
    let reason = ""

    try {
      const payload = (await response.json()) as GoogleDriveErrorPayload
      const responseMessage = payload.error?.message
      const responseReason = payload.error?.errors?.[0]?.reason

      if (responseMessage) {
        message = `Google Drive API error: ${responseMessage}`
      }

      if (responseReason) {
        reason = responseReason
      }
    } catch {
      // Ignore non-JSON error payloads.
    }

    if (response.status === 403 && isQuotaReason(reason)) {
      return new SyncQuotaError(message)
    }

    if (response.status === 403 || response.status === 400) {
      return new SyncAuthError(message)
    }

    return new SyncNetworkError(message)
  }

  private namespace(): string {
    const value = this.config.remotePath.trim().replace(/^\/+|\/+$/g, "")
    return value || DEFAULT_GOOGLE_DRIVE_REMOTE_PATH
  }

  private namespacePrefix(): string {
    return `${this.namespace()}/`
  }

  private toStoredPath(remotePath: string): string {
    const relativePath = normalizeFilePath(remotePath)
    return relativePath ? `${this.namespace()}/${relativePath}` : this.namespace()
  }

  private toStoredPrefix(baseDir: string): string {
    return baseDir ? `${this.namespace()}/${baseDir}` : this.namespacePrefix()
  }

  private toRelativePath(storedPath: string): string {
    const namespace = this.namespace()

    if (storedPath === namespace) {
      return ""
    }

    return storedPath.startsWith(`${namespace}/`) ? storedPath.slice(namespace.length + 1) : storedPath
  }

  private toFileInfo(remotePath: string, file: GoogleDriveFile): RemoteFileInfo {
    return {
      path: remotePath,
      size: Number(file.size ?? 0),
      lastModified: file.modifiedTime ?? "",
      isDirectory: false,
    }
  }

  private createDriveFileName(storedPath: string): string {
    const relativePath = this.toRelativePath(storedPath)
    const baseName = path.posix.basename(relativePath || storedPath)
    return `${baseName}-${toBase64Url(Buffer.from(storedPath)).slice(0, 80)}`
  }
}

function normalizeFilePath(value: string): string {
  return value
    .split("/")
    .filter(Boolean)
    .join("/")
}

function normalizeDir(value: string): string {
  const normalized = normalizeFilePath(value)
  return normalized ? `${normalized}/` : ""
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

function isQuotaReason(reason: string): boolean {
  return ["dailyLimitExceeded", "rateLimitExceeded", "storageQuotaExceeded", "userRateLimitExceeded"].includes(reason)
}

function toBase64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}
