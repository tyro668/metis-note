import { randomUUID } from "node:crypto"

import type { CloudStorageProvider } from "./providers/types"
import type {
  CommitCursor,
  CommitManifest,
  CommitOperation,
  FileChange,
  MaterializedRemoteView,
  StagedObject,
} from "./types"
import type { SyncConfig } from "../../../../src/shared/sync"
import type { ChangeTracker } from "./change-tracker"
import { encrypt } from "./encryption"

export class CommitLog {
  constructor(
    private readonly provider: CloudStorageProvider,
    private readonly config: SyncConfig,
    private readonly changeTracker: ChangeTracker,
    private readonly encryptionContentKey: Buffer | null,
  ) {}

  /**
   * Stage a local file as a content-addressed object.
   * Returns the staged object ready for upload.
   */
  async stageObject(
    filePath: string,
    localData: Buffer,
    fingerprint: string,
  ): Promise<StagedObject> {
    const payload = this.encryptionContentKey
      ? encrypt(localData, this.encryptionContentKey)
      : localData

    const payloadHash = this.changeTracker.computeFingerprint(payload)
    const prefix = payloadHash.slice(0, 2)
    const objectKey = `objects/${prefix}/${payloadHash}.bin`

    return {
      path: filePath,
      fingerprint,
      payloadHash,
      objectKey,
      size: localData.length,
      storedSize: payload.length,
      data: payload,
    }
  }

  /**
   * Upload staged objects to the cloud (content-addressed, idempotent).
   */
  async uploadObjects(objects: StagedObject[]): Promise<void> {
    for (const obj of objects) {
      const alreadyExists = await this.provider.exists(obj.objectKey)

      if (!alreadyExists) {
        await this.provider.upload(obj.objectKey, obj.data)
      }
    }
  }

  /**
   * Build and publish a commit manifest.
   * The commit must be the LAST thing written after all objects are uploaded.
   */
  async publishCommit(params: {
    changes: FileChange[]
    stagedObjects: StagedObject[]
    deletions: FileChange[]
    remoteView: MaterializedRemoteView
    localLamport: number
  }): Promise<CommitManifest | null> {
    const operations: CommitOperation[] = []

    for (const obj of params.stagedObjects) {
      const change = params.changes.find((c) => c.path === obj.path)
      operations.push({
        type: "put",
        path: obj.path,
        fingerprint: obj.fingerprint,
        payloadHash: obj.payloadHash,
        objectKey: obj.objectKey,
        size: obj.size,
        storedSize: obj.storedSize,
        baseFingerprint: change?.baseFingerprint ?? null,
      })
    }

    for (const del of params.deletions) {
      operations.push({
        type: "delete",
        path: del.path,
        baseFingerprint: del.baseFingerprint,
      })
    }

    if (operations.length === 0) {
      return null
    }

    const lamport = Math.max(params.localLamport, params.remoteView.maxLamport) + 1
    const commitId = createMonotonicCommitId()

    const commit: CommitManifest = {
      version: 1,
      commitId,
      deviceId: this.config.deviceId,
      deviceName: this.config.deviceName,
      createdAt: new Date().toISOString(),
      lamport,
      baseCursor: { ...params.remoteView.cursor },
      operations,
    }

    const remotePath = `commits/${this.config.deviceId}/${commitId}.json`
    await this.provider.upload(remotePath, Buffer.from(JSON.stringify(commit, null, 2)))

    return commit
  }

  /**
   * List all commits across all devices after the given cursor.
   */
  async listCommitsAfterCursor(cursor: CommitCursor): Promise<CommitManifest[]> {
    const commits: CommitManifest[] = []
    let deviceDirs: import("./providers/types").RemoteFileInfo[]

    try {
      deviceDirs = await this.provider.list("commits/")
    } catch {
      return []
    }

    for (const dir of deviceDirs) {
      if (!dir.isDirectory) continue

      const deviceId = dir.path.replace("commits/", "").replace(/\/$/, "")
      const cursorCommitId = cursor[deviceId]

      let files: import("./providers/types").RemoteFileInfo[]

      try {
        files = await this.provider.list(dir.path)
      } catch {
        continue
      }

      for (const file of files) {
        if (file.isDirectory) continue

        const fileName = path.basename(file.path, ".json")

        // Skip commits already materialized
        if (cursorCommitId && fileName <= cursorCommitId) continue

        try {
          const data = await this.provider.download(file.path)
          const manifest = JSON.parse(data.toString()) as CommitManifest

          if (manifest.version === 1 && manifest.commitId && manifest.deviceId) {
            commits.push(manifest)
          }
        } catch {
          // Skip corrupted commits
        }
      }
    }

    return commits
  }
}

// ── Helpers ────────────────────────────────────────────────────

import path from "node:path"

/**
 * Generate a monotonically increasing commit ID.
 * Format: <timestamp-ms>-<random-suffix>
 * Sortable by string comparison.
 */
function createMonotonicCommitId(): string {
  const ts = Date.now().toString(36).padStart(9, "0")
  const rand = randomUUID().replace(/-/g, "").slice(0, 8)
  return `${ts}-${rand}`
}
