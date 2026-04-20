// ─── Commit log & sync state types ─────────────────────────────

/** deviceId -> latest commitId already materialized */
export type CommitCursor = Record<string, string>

export type CommitOperation =
  | {
      type: "put"
      path: string
      fingerprint: string
      payloadHash: string
      objectKey: string
      size: number
      storedSize: number
      baseFingerprint: string | null
    }
  | {
      type: "delete"
      path: string
      baseFingerprint: string | null
    }

export interface CommitManifest {
  version: 1
  commitId: string
  deviceId: string
  deviceName: string
  createdAt: string
  lamport: number
  baseCursor: CommitCursor
  operations: CommitOperation[]
}

export interface CloudFileEntry {
  fingerprint: string
  payloadHash: string
  objectKey: string
  size: number
  storedSize: number
  lamport: number
  updatedAt: string
  updatedBy: string
  revision: number
}

export interface CloudSyncState {
  version: 2
  snapshotId: string
  generatedAt: string
  generatedBy: string
  basedOnCursor: CommitCursor
  maxLamport: number
  files: Record<string, CloudFileEntry>
}

export interface LocalFileEntry {
  baseFingerprint: string | null
  baseRevision: number
  cachedLocalFingerprint: string | null
  lastSeenMtimeMs: number | null
  lastSeenSize: number | null
  localPath: string
}

export interface LocalNoteSyncBaseline {
  syncedUpdatedAt: string
}

export interface LocalSyncState {
  version: 2
  deviceId: string
  lastSuccessfulSyncAt: string | null
  lastAppliedCursor: CommitCursor
  lastSnapshotId: string | null
  lastLamport: number
  files: Record<string, LocalFileEntry>
  noteBaselines: Record<string, LocalNoteSyncBaseline>
}

export interface DeviceManifest {
  version: 1
  devices: import("../../../../src/shared/sync").DeviceRecord[]
}

export interface FileChange {
  path: string
  type: "push" | "pull" | "conflict" | "delete-remote" | "delete-local" | "none"
  localFingerprint: string | null
  cloudFingerprint: string | null
  baseFingerprint: string | null
}

/** Materialized view of remote state after replaying commits on snapshot */
export interface MaterializedRemoteView {
  files: Record<string, CloudFileEntry>
  cursor: CommitCursor
  maxLamport: number
}

export interface StagedObject {
  path: string
  fingerprint: string
  payloadHash: string
  objectKey: string
  size: number
  storedSize: number
  data: Buffer
}

const EMPTY_CLOUD_SYNC_STATE: CloudSyncState = {
  version: 2,
  snapshotId: "",
  generatedAt: "",
  generatedBy: "",
  basedOnCursor: {},
  maxLamport: 0,
  files: {},
}

export function createEmptyCloudSyncState(): CloudSyncState {
  return { ...EMPTY_CLOUD_SYNC_STATE, basedOnCursor: {}, files: {} }
}

export function createEmptyLocalSyncState(deviceId: string): LocalSyncState {
  return {
    version: 2,
    deviceId,
    lastSuccessfulSyncAt: null,
    lastAppliedCursor: {},
    lastSnapshotId: null,
    lastLamport: 0,
    files: {},
    noteBaselines: {},
  }
}
