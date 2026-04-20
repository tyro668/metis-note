import type { WebDAVConfig } from "../../../../../src/shared/sync"
import type { CloudStorageProvider, RemoteFileInfo, UploadOptions } from "./types"
import { SyncAuthError, SyncFileNotFoundError, SyncNetworkError } from "./types"

export class WebDAVProvider implements CloudStorageProvider {
  readonly type = "webdav" as const
  private config: WebDAVConfig

  constructor(config: WebDAVConfig) {
    this.config = config
  }

  async initialize(): Promise<void> {
    const ok = await this.checkConnection()

    if (!ok) {
      throw new SyncAuthError("Failed to connect to WebDAV server")
    }

    // Ensure remote directory exists
    await this.ensureCollection(this.basePath())
  }

  async checkConnection(): Promise<boolean> {
    try {
      const resp = await this.request("OPTIONS", "/")
      return resp.ok || resp.status === 200 || resp.status === 204
    } catch {
      return false
    }
  }

  async upload(remotePath: string, data: Buffer, options?: UploadOptions): Promise<void> {
    const fullPath = this.fullPath(remotePath)

    // Ensure parent directory exists
    const parentPath = fullPath.substring(0, fullPath.lastIndexOf("/"))

    if (parentPath && parentPath !== this.basePath()) {
      await this.ensureCollection(parentPath)
    }

    const headers: Record<string, string> = {}

    if (options?.contentType) {
      headers["Content-Type"] = options.contentType
    }

    const resp = await this.request("PUT", fullPath, data, headers)

    if (!resp.ok && resp.status !== 201 && resp.status !== 204) {
      throw new SyncNetworkError(`WebDAV upload failed: ${resp.status} ${resp.statusText}`)
    }
  }

  async download(remotePath: string): Promise<Buffer> {
    const fullPath = this.fullPath(remotePath)
    const resp = await this.request("GET", fullPath)

    if (resp.status === 404) {
      throw new SyncFileNotFoundError(remotePath)
    }

    if (!resp.ok) {
      throw new SyncNetworkError(`WebDAV download failed: ${resp.status}`)
    }

    return Buffer.from(await resp.arrayBuffer())
  }

  async list(remoteDir: string, _recursive?: boolean): Promise<RemoteFileInfo[]> {
    const fullPath = this.fullPath(remoteDir.endsWith("/") ? remoteDir : `${remoteDir}/`)

    const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`

    const resp = await this.request("PROPFIND", fullPath, Buffer.from(body), {
      "Content-Type": "application/xml",
      Depth: "1",
    })

    if (!resp.ok && resp.status !== 207) {
      return []
    }

    const xml = await resp.text()
    return this.parsePropfindResponse(xml, fullPath)
  }

  async delete(remotePath: string): Promise<void> {
    const fullPath = this.fullPath(remotePath)
    const resp = await this.request("DELETE", fullPath)

    if (!resp.ok && resp.status !== 204 && resp.status !== 404) {
      throw new SyncNetworkError(`WebDAV delete failed: ${resp.status}`)
    }
  }

  async deleteBatch(remotePaths: string[]): Promise<void> {
    for (const p of remotePaths) {
      await this.delete(p)
    }
  }

  async exists(remotePath: string): Promise<boolean> {
    const fullPath = this.fullPath(remotePath)

    try {
      const resp = await this.request("HEAD", fullPath)
      return resp.ok || resp.status === 200
    } catch {
      return false
    }
  }

  async getMetadata(remotePath: string): Promise<RemoteFileInfo | null> {
    const fullPath = this.fullPath(remotePath)

    const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`

    try {
      const resp = await this.request("PROPFIND", fullPath, Buffer.from(body), {
        "Content-Type": "application/xml",
        Depth: "0",
      })

      if (!resp.ok && resp.status !== 207) return null

      const xml = await resp.text()
      const files = this.parsePropfindResponse(xml, fullPath)
      return files[0] ?? null
    } catch {
      return null
    }
  }

  async refreshAuth(): Promise<boolean> {
    // WebDAV uses basic auth; no refresh mechanism
    return true
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

  private async request(
    method: string,
    urlPath: string,
    body?: Buffer,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    const serverUrl = this.config.serverUrl.replace(/\/$/, "")
    const url = `${serverUrl}${urlPath.startsWith("/") ? "" : "/"}${urlPath}`
    const auth = btoa(`${this.config.username}:${this.config.password}`)

    const headers: Record<string, string> = {
      Authorization: `Basic ${auth}`,
      ...extraHeaders,
    }

    try {
      return await fetch(url, {
        method,
        headers,
        body: body ? new Uint8Array(body) : undefined,
      })
    } catch (err: any) {
      if (
        err.message?.includes("ECONNREFUSED") ||
        err.message?.includes("ENOTFOUND") ||
        err.message?.includes("ETIMEDOUT") ||
        err.message?.includes("fetch failed")
      ) {
        throw new SyncNetworkError(`WebDAV connection error: ${err.message}`)
      }

      throw err
    }
  }

  private async ensureCollection(collectionPath: string): Promise<void> {
    // Split the path and create each segment
    const segments = collectionPath.split("/").filter(Boolean)
    let current = ""

    for (const seg of segments) {
      current += `/${seg}`
      const resp = await this.request("MKCOL", `${current}/`)

      // 405 = already exists, 201 = created, both are OK
      if (!resp.ok && resp.status !== 405 && resp.status !== 201 && resp.status !== 301) {
        // Ignore most errors during collection creation
      }
    }
  }

  private parsePropfindResponse(xml: string, requestPath: string): RemoteFileInfo[] {
    const results: RemoteFileInfo[] = []

    // Simple regex-based XML parsing for DAV:response elements
    const responsePattern = /<d:response>([\s\S]*?)<\/d:response>/gi
    let match: RegExpExecArray | null

    while ((match = responsePattern.exec(xml)) !== null) {
      const block = match[1]

      const hrefMatch = /<d:href>(.*?)<\/d:href>/i.exec(block)
      if (!hrefMatch) continue

      const href = decodeURIComponent(hrefMatch[1])

      // Skip the collection itself
      if (href === requestPath || href === `${requestPath}/`) continue

      const isDir = /<d:collection\s*\/?>/.test(block)
      const sizeMatch = /<d:getcontentlength>(.*?)<\/d:getcontentlength>/i.exec(block)
      const modifiedMatch = /<d:getlastmodified>(.*?)<\/d:getlastmodified>/i.exec(block)

      const relativePath = href
        .replace(this.basePath(), "")
        .replace(/^\//, "")
        .replace(/\/$/, "")

      if (!relativePath) continue

      results.push({
        path: isDir ? `${relativePath}/` : relativePath,
        size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
        lastModified: modifiedMatch ? new Date(modifiedMatch[1]).toISOString() : "",
        isDirectory: isDir,
      })
    }

    return results
  }
}
