import type { BaiduPanAuthResult, BaiduPanConfig } from "../../../../../src/shared/sync"
import type { CloudStorageProvider, RemoteFileInfo, UploadOptions } from "./types"
import { SyncAuthError, SyncFileNotFoundError, SyncNetworkError, SyncQuotaError } from "./types"

const BAIDU_API_BASE = "https://pan.baidu.com/rest/2.0/xpan"
const BAIDU_UPLOAD_BASE = "https://d.pcs.baidu.com/rest/2.0/pcs"

interface BaiduPanProviderOptions {
  refreshTokens?: (refreshToken: string) => Promise<BaiduPanAuthResult>
  onTokenRefreshed?: (config: BaiduPanConfig) => void
}

export class BaiduPanProvider implements CloudStorageProvider {
  readonly type = "baidu-pan" as const
  private config: BaiduPanConfig
  private refreshTokens: ((refreshToken: string) => Promise<BaiduPanAuthResult>) | null
  private onTokenRefreshed: ((config: BaiduPanConfig) => void) | null

  constructor(config: BaiduPanConfig, options: BaiduPanProviderOptions = {}) {
    this.config = config
    this.refreshTokens = options.refreshTokens ?? null
    this.onTokenRefreshed = options.onTokenRefreshed ?? null
  }

  async initialize(): Promise<void> {
    if (!this.config.accessToken || !this.config.refreshToken) {
      throw new SyncAuthError("Baidu Pan authorization is required before syncing")
    }

    const connected = await this.checkConnection()

    if (!connected) {
      throw new SyncAuthError("Failed to connect to Baidu Pan")
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      const resp = await this.apiGet("/nas", { method: "uinfo" })
      return resp.errno === 0
    } catch {
      return false
    }
  }

  async upload(remotePath: string, data: Buffer, _options?: UploadOptions): Promise<void> {
    const fullPath = this.fullPath(remotePath)

    // Step 1: Pre-create (single-block upload for files < 4MB)
    const precreateResp = await this.apiPost("/file", {
      method: "precreate",
      path: fullPath,
      size: data.length,
      isdir: 0,
      autoinit: 1,
      rtype: 3, // overwrite existing
      block_list: JSON.stringify([this.md5Hash(data)]),
    })

    if (precreateResp.errno !== 0) {
      throw this.wrapError(precreateResp, "precreate")
    }

    // Step 2: Upload block
    const uploadUrl = `${BAIDU_UPLOAD_BASE}/superfile2?method=upload&access_token=${this.config.accessToken}&path=${encodeURIComponent(fullPath)}&uploadid=${precreateResp.uploadid}&partseq=0`
    const formData = new FormData()
    formData.append("file", new Blob([new Uint8Array(data)]))

    const uploadResp = await fetch(uploadUrl, { method: "POST", body: formData })

    if (!uploadResp.ok) {
      throw new SyncNetworkError(`Baidu Pan upload failed: ${uploadResp.status}`)
    }

    // Step 3: Create (finalize)
    const createResp = await this.apiPost("/file", {
      method: "create",
      path: fullPath,
      size: data.length,
      isdir: 0,
      rtype: 3,
      uploadid: precreateResp.uploadid,
      block_list: JSON.stringify([this.md5Hash(data)]),
    })

    if (createResp.errno !== 0) {
      throw this.wrapError(createResp, "create")
    }
  }

  async download(remotePath: string): Promise<Buffer> {
    const fullPath = this.fullPath(remotePath)

    // Get download link via filemetas
    const metaResp = await this.apiGet("/multimedia", {
      method: "filemetas",
      fsids: JSON.stringify([await this.resolveFsId(fullPath)]),
      dlink: 1,
    })

    if (metaResp.errno !== 0 || !metaResp.list?.[0]?.dlink) {
      throw new SyncFileNotFoundError(remotePath)
    }

    const dlink = `${metaResp.list[0].dlink}&access_token=${this.config.accessToken}`
    const resp = await fetch(dlink)

    if (!resp.ok) {
      throw new SyncNetworkError(`Baidu Pan download failed: ${resp.status}`)
    }

    return Buffer.from(await resp.arrayBuffer())
  }

  async list(remoteDir: string, _recursive?: boolean): Promise<RemoteFileInfo[]> {
    const fullPath = this.fullPath(remoteDir)

    const resp = await this.apiGet("/file", {
      method: "list",
      dir: fullPath,
      limit: 1000,
    })

    if (resp.errno !== 0) return []

    return (resp.list ?? []).map((item: any) => ({
      path: item.path.replace(this.basePath(), "").replace(/^\//, ""),
      size: item.size ?? 0,
      lastModified: new Date((item.server_mtime ?? 0) * 1000).toISOString(),
      isDirectory: item.isdir === 1,
    }))
  }

  async delete(remotePath: string): Promise<void> {
    const fullPath = this.fullPath(remotePath)

    await this.apiPost("/file", {
      method: "filemanager",
      opera: "delete",
      filelist: JSON.stringify([fullPath]),
    })
  }

  async deleteBatch(remotePaths: string[]): Promise<void> {
    if (remotePaths.length === 0) return

    const fullPaths = remotePaths.map((p) => this.fullPath(p))

    await this.apiPost("/file", {
      method: "filemanager",
      opera: "delete",
      filelist: JSON.stringify(fullPaths),
    })
  }

  async exists(remotePath: string): Promise<boolean> {
    try {
      const meta = await this.getMetadata(remotePath)
      return meta !== null
    } catch {
      return false
    }
  }

  async getMetadata(remotePath: string): Promise<RemoteFileInfo | null> {
    const fullPath = this.fullPath(remotePath)

    try {
      const resp = await this.apiGet("/file", {
        method: "list",
        dir: fullPath.substring(0, fullPath.lastIndexOf("/")),
        limit: 1000,
      })

      if (resp.errno !== 0) return null

      const target = (resp.list ?? []).find((item: any) => item.path === fullPath)

      if (!target) return null

      return {
        path: remotePath,
        size: target.size ?? 0,
        lastModified: new Date((target.server_mtime ?? 0) * 1000).toISOString(),
        isDirectory: target.isdir === 1,
      }
    } catch {
      return null
    }
  }

  async refreshAuth(): Promise<boolean> {
    if (!this.config.refreshToken || !this.refreshTokens) {
      return false
    }

    try {
      const data = await this.refreshTokens(this.config.refreshToken)
      this.config = {
        ...this.config,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        accountName: data.accountName ?? this.config.accountName ?? null,
        openId: data.openId ?? this.config.openId ?? null,
      }

      this.onTokenRefreshed?.(this.config)
      return true
    } catch {
      return false
    }
  }

  async dispose(): Promise<void> {
    // No persistent resources
  }

  // ── Helpers ──────────────────────────────────────────────────

  private basePath(): string {
    const p = this.config.remotePath
    return p.endsWith("/") ? p.slice(0, -1) : p
  }

  private fullPath(relativePath: string): string {
    return `${this.basePath()}/${relativePath}`
  }

  private async apiGet(endpoint: string, params: Record<string, any>): Promise<any> {
    const url = new URL(`${BAIDU_API_BASE}${endpoint}`)
    url.searchParams.set("access_token", this.config.accessToken)

    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v))
    }

    const resp = await fetch(url.toString())

    if (!resp.ok) {
      if (resp.status === 401) {
        const refreshed = await this.refreshAuth()
        if (refreshed) return this.apiGet(endpoint, params)
        throw new SyncAuthError("Baidu Pan authentication expired")
      }

      throw new SyncNetworkError(`Baidu Pan API error: ${resp.status}`)
    }

    return resp.json()
  }

  private async apiPost(endpoint: string, params: Record<string, any>): Promise<any> {
    const method = params.method
    const url = new URL(`${BAIDU_API_BASE}${endpoint}`)
    url.searchParams.set("access_token", this.config.accessToken)

    if (method) {
      url.searchParams.set("method", method)
    }

    const body = new URLSearchParams()

    for (const [k, v] of Object.entries(params)) {
      if (k !== "method") body.set(k, String(v))
    }

    const resp = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })

    if (!resp.ok) {
      if (resp.status === 401) {
        const refreshed = await this.refreshAuth()
        if (refreshed) return this.apiPost(endpoint, params)
        throw new SyncAuthError("Baidu Pan authentication expired")
      }

      throw new SyncNetworkError(`Baidu Pan API error: ${resp.status}`)
    }

    return resp.json()
  }

  private async resolveFsId(fullPath: string): Promise<number> {
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"))
    const name = fullPath.substring(fullPath.lastIndexOf("/") + 1)

    const resp = await this.apiGet("/file", {
      method: "list",
      dir,
      limit: 1000,
    })

    const item = (resp.list ?? []).find((f: any) => f.server_filename === name)

    if (!item?.fs_id) {
      throw new SyncFileNotFoundError(fullPath)
    }

    return item.fs_id
  }

  private md5Hash(data: Buffer): string {
    const { createHash } = require("node:crypto")
    return createHash("md5").update(data).digest("hex")
  }

  private wrapError(resp: any, context: string): Error {
    const errno = resp.errno ?? -1

    if (errno === -6 || errno === 111) {
      return new SyncAuthError(`Baidu Pan auth error (${context}): errno=${errno}`)
    }

    if (errno === 31034) {
      return new SyncQuotaError("Baidu Pan quota exceeded")
    }

    return new SyncNetworkError(`Baidu Pan error (${context}): errno=${errno}`)
  }
}
