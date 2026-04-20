import type { CloudStorageProvider } from "./providers/types"
import type {
  CloudFileEntry,
  CloudSyncState,
  CommitCursor,
  CommitManifest,
  MaterializedRemoteView,
} from "./types"
import { createEmptyCloudSyncState } from "./types"

/**
 * Load the snapshot (sync-state.json) from cloud, or return an empty state if not found.
 */
export async function loadSnapshot(provider: CloudStorageProvider): Promise<CloudSyncState> {
  try {
    const exists = await provider.exists("sync-state.json")
    if (!exists) return createEmptyCloudSyncState()

    const data = await provider.download("sync-state.json")
    const parsed = JSON.parse(data.toString()) as CloudSyncState

    if (parsed.version === 2 && parsed.files) {
      return parsed
    }

    return createEmptyCloudSyncState()
  } catch {
    return createEmptyCloudSyncState()
  }
}

/**
 * Sort commits in deterministic global order: (lamport ASC, deviceId ASC, commitId ASC).
 * All devices MUST use the same sort to guarantee consistent materialized views.
 */
export function sortCommits(commits: CommitManifest[]): CommitManifest[] {
  return [...commits].sort((a, b) => {
    if (a.lamport !== b.lamport) return a.lamport - b.lamport
    if (a.deviceId !== b.deviceId) return a.deviceId < b.deviceId ? -1 : 1
    return a.commitId < b.commitId ? -1 : a.commitId > b.commitId ? 1 : 0
  })
}

/**
 * Materialize the remote view by replaying sorted commits on top of a snapshot.
 */
export function materializeRemoteView(
  snapshot: CloudSyncState,
  newCommits: CommitManifest[],
): MaterializedRemoteView {
  const files: Record<string, CloudFileEntry> = { ...snapshot.files }
  const cursor: CommitCursor = { ...snapshot.basedOnCursor }
  let maxLamport = snapshot.maxLamport

  const sorted = sortCommits(newCommits)

  for (const commit of sorted) {
    for (const op of commit.operations) {
      if (op.type === "put") {
        const existing = files[op.path]
        files[op.path] = {
          fingerprint: op.fingerprint,
          payloadHash: op.payloadHash,
          objectKey: op.objectKey,
          size: op.size,
          storedSize: op.storedSize,
          lamport: commit.lamport,
          updatedAt: commit.createdAt,
          updatedBy: commit.deviceId,
          revision: (existing?.revision ?? 0) + 1,
        }
      } else if (op.type === "delete") {
        delete files[op.path]
      }
    }

    cursor[commit.deviceId] = commit.commitId

    if (commit.lamport > maxLamport) {
      maxLamport = commit.lamport
    }
  }

  return { files, cursor, maxLamport }
}

/**
 * Advance the cursor after applying commits and optionally a local commit.
 */
export function advanceCursor(
  baseCursor: CommitCursor,
  appliedCommits: CommitManifest[],
  localCommit: CommitManifest | null,
): CommitCursor {
  const next: CommitCursor = { ...baseCursor }

  for (const commit of appliedCommits) {
    const existing = next[commit.deviceId]
    if (!existing || commit.commitId > existing) {
      next[commit.deviceId] = commit.commitId
    }
  }

  if (localCommit) {
    next[localCommit.deviceId] = localCommit.commitId
  }

  return next
}
