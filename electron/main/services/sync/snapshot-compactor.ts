import { randomUUID } from "node:crypto"

import type { CloudStorageProvider } from "./providers/types"
import type { CloudSyncState, CommitCursor, CommitManifest } from "./types"
import { loadSnapshot, materializeRemoteView, sortCommits } from "./remote-view"

/**
 * Re-generate sync-state.json snapshot from commits if it's too stale.
 * This reduces the number of commits that need to be replayed on each sync.
 */
export async function compactSnapshotIfNeeded(
  provider: CloudStorageProvider,
  deviceId: string,
  maxCommitsBeforeCompaction: number = 50,
): Promise<boolean> {
  const snapshot = await loadSnapshot(provider)

  // Count new commits since last snapshot
  const allCommits = await listAllCommits(provider, snapshot.basedOnCursor)

  if (allCommits.length < maxCommitsBeforeCompaction) {
    return false
  }

  // Materialize and save new snapshot
  const view = materializeRemoteView(snapshot, allCommits)

  const newSnapshot: CloudSyncState = {
    version: 2,
    snapshotId: randomUUID(),
    generatedAt: new Date().toISOString(),
    generatedBy: deviceId,
    basedOnCursor: view.cursor,
    maxLamport: view.maxLamport,
    files: view.files,
  }

  await provider.upload(
    "sync-state.json",
    Buffer.from(JSON.stringify(newSnapshot, null, 2)),
  )

  return true
}

/**
 * Remove commits that are older than the current snapshot cursor.
 * These commits have already been folded into the snapshot.
 */
export async function garbageCollectCommits(
  provider: CloudStorageProvider,
): Promise<number> {
  const snapshot = await loadSnapshot(provider)
  let removedCount = 0
  let deviceDirs: import("./providers/types").RemoteFileInfo[]

  try {
    deviceDirs = await provider.list("commits/")
  } catch {
    return 0
  }

  for (const dir of deviceDirs) {
    if (!dir.isDirectory) continue

    const deviceId = dir.path.replace("commits/", "").replace(/\/$/, "")
    const cursorCommitId = snapshot.basedOnCursor[deviceId]

    if (!cursorCommitId) continue

    let files: import("./providers/types").RemoteFileInfo[]

    try {
      files = await provider.list(dir.path)
    } catch {
      continue
    }

    const toDelete: string[] = []

    for (const file of files) {
      if (file.isDirectory) continue

      const fileName = file.path.replace(/.*\//, "").replace(".json", "")

      if (fileName <= cursorCommitId) {
        toDelete.push(file.path)
      }
    }

    if (toDelete.length > 0) {
      await provider.deleteBatch(toDelete)
      removedCount += toDelete.length
    }
  }

  return removedCount
}

async function listAllCommits(
  provider: CloudStorageProvider,
  cursor: CommitCursor,
): Promise<CommitManifest[]> {
  const commits: CommitManifest[] = []
  let deviceDirs: import("./providers/types").RemoteFileInfo[]

  try {
    deviceDirs = await provider.list("commits/")
  } catch {
    return []
  }

  for (const dir of deviceDirs) {
    if (!dir.isDirectory) continue

    const deviceId = dir.path.replace("commits/", "").replace(/\/$/, "")
    const cursorCommitId = cursor[deviceId]

    let files: import("./providers/types").RemoteFileInfo[]

    try {
      files = await provider.list(dir.path)
    } catch {
      continue
    }

    for (const file of files) {
      if (file.isDirectory) continue

      const fileName = file.path.replace(/.*\//, "").replace(".json", "")

      if (cursorCommitId && fileName <= cursorCommitId) continue

      try {
        const data = await provider.download(file.path)
        const manifest = JSON.parse(data.toString()) as CommitManifest

        if (manifest.version === 1) {
          commits.push(manifest)
        }
      } catch {
        // skip corrupted
      }
    }
  }

  return sortCommits(commits)
}
