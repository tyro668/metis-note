// ─── Cloud storage provider interface ──────────────────────────

import type { SyncProviderType } from "../../../../../src/shared/sync"

export interface UploadOptions {
  contentType?: string
  ifMatchHash?: string
}

export interface RemoteFileInfo {
  path: string
  size: number
  lastModified: string
  isDirectory: boolean
}

export interface CloudStorageProvider {
  readonly type: SyncProviderType

  initialize(): Promise<void>
  checkConnection(): Promise<boolean>

  upload(remotePath: string, data: Buffer, options?: UploadOptions): Promise<void>
  download(remotePath: string): Promise<Buffer>
  list(remoteDir: string, recursive?: boolean): Promise<RemoteFileInfo[]>
  delete(remotePath: string): Promise<void>
  deleteBatch(remotePaths: string[]): Promise<void>
  exists(remotePath: string): Promise<boolean>
  getMetadata(remotePath: string): Promise<RemoteFileInfo | null>

  refreshAuth(): Promise<boolean>
  dispose(): Promise<void>
}

// ─── Sync errors ───────────────────────────────────────────────

export class SyncError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message)
    this.name = "SyncError"
  }
}

export class SyncAuthError extends SyncError {
  constructor(message: string) {
    super(message, false)
    this.name = "SyncAuthError"
  }
}

export class SyncNetworkError extends SyncError {
  constructor(message: string) {
    super(message, true)
    this.name = "SyncNetworkError"
  }
}

export class SyncFileNotFoundError extends SyncError {
  constructor(filePath: string) {
    super(`File not found: ${filePath}`, false)
    this.name = "SyncFileNotFoundError"
  }
}

export class SyncConcurrencyError extends SyncError {
  constructor() {
    super("Remote sync view advanced concurrently", true)
    this.name = "SyncConcurrencyError"
  }
}

export class SyncQuotaError extends SyncError {
  constructor(message: string) {
    super(message, false)
    this.name = "SyncQuotaError"
  }
}
