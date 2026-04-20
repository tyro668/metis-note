// ─── Sync provider types ───────────────────────────────────────

export const BAIDU_PAN_LOCAL_CALLBACK_URL = "http://127.0.0.1:62888/auth/baidu-pan/callback"
export const DEFAULT_BAIDU_PAN_AUTH_BROKER_URL = "http://127.0.0.1:62900"
export const DEFAULT_BAIDU_PAN_REMOTE_PATH = "/apps/MetisNote"
export const GOOGLE_DRIVE_LOCAL_CALLBACK_URL = "http://127.0.0.1:62891/auth/google-drive/callback"
export const DEFAULT_GOOGLE_DRIVE_REMOTE_PATH = "metis-note"

export type SyncProviderType = "baidu-pan" | "google-drive" | "s3" | "webdav"

export interface BaiduPanConfig {
  accessToken: string
  refreshToken: string
  expiresAt: string
  remotePath: string
  accountName?: string | null
  openId?: string | null
}

export interface BaiduPanAuthResult {
  accessToken: string
  refreshToken: string
  expiresAt: string
  accountName?: string | null
  openId?: string | null
}

export interface GoogleDriveConfig {
  clientId: string
  accessToken: string
  refreshToken: string
  expiresAt: string
  remotePath: string
  accountEmail?: string | null
  accountName?: string | null
  userId?: string | null
}

export interface GoogleDriveAuthResult {
  accessToken: string
  refreshToken: string
  expiresAt: string
  accountEmail?: string | null
  accountName?: string | null
  userId?: string | null
}

export interface S3Config {
  endpoint: string
  region: string
  bucket: string
  prefix: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

export interface WebDAVConfig {
  serverUrl: string
  username: string
  password: string
  remotePath: string
}

export interface EncryptionConfig {
  enabled: boolean
  salt: string
  iterations: number
  verificationTag: string
}

// ─── Sync configuration ────────────────────────────────────────

export interface SyncConfig {
  version: 1
  enabled: boolean
  provider: SyncProviderType
  providerConfig: BaiduPanConfig | GoogleDriveConfig | S3Config | WebDAVConfig
  encryption: EncryptionConfig | null
  syncVersionHistory: boolean
  syncInterval: number
  assetSyncMode: "full" | "on-demand"
  deviceId: string
  deviceName: string
}

// ─── Sync status ───────────────────────────────────────────────

export type SyncPhase =
  | "scanning"
  | "comparing"
  | "uploading"
  | "downloading"
  | "merging"
  | "finalizing"

export interface SyncProgress {
  phase: SyncPhase
  totalFiles: number
  completedFiles: number
  totalBytes: number
  transferredBytes: number
  currentFile: string | null
}

export type SyncStatus =
  | { state: "idle" }
  | { state: "syncing"; phase: SyncPhase; progress: SyncProgress }
  | { state: "error"; message: string; retryAt: string | null }
  | { state: "conflict"; pendingCount: number }
  | { state: "disabled" }
  | { state: "not-configured" }

export type NoteSyncState = "synced" | "upload-pending" | "download-pending" | "conflict" | "syncing"
export type NoteSyncStateMap = Record<string, NoteSyncState>

// ─── Sync result ───────────────────────────────────────────────

export type SyncResult =
  | {
      status: "success"
      pushed: number
      pulled: number
      conflicts: number
      deletedRemote: number
      deletedLocal: number
      timestamp: string
    }
  | { status: "skipped"; reason: string }
  | { status: "error"; error: string }

// ─── Device ────────────────────────────────────────────────────

export interface DeviceRecord {
  deviceId: string
  deviceName: string
  platform: string
  appVersion: string
  lastSyncAt: string
  registeredAt: string
}

// ─── Conflict ──────────────────────────────────────────────────

export type ConflictResolution = "keep-local" | "keep-cloud" | "keep-both"

export interface SyncConflict {
  id: string
  filePath: string
  noteTitle: string
  detectedAt: string
  localVersion: {
    fingerprint: string
    updatedAt: string
    deviceId: string
    deviceName: string
    wordCount: number
  }
  cloudVersion: {
    fingerprint: string
    updatedAt: string
    deviceId: string
    deviceName: string
    revision: number
    wordCount: number
  }
  status: "pending" | "resolved"
  resolution: ConflictResolution | null
}
