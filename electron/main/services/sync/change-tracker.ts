import { createHash, createHmac } from "node:crypto"
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

import type { CloudSyncState, FileChange, LocalSyncState, MaterializedRemoteView } from "./types"

/** Files / directories to include in sync scanning */
const SYNC_PATHS = ["index.json", "items", "templates.json"] as const
const OPTIONAL_SYNC_PATHS = ["assets", "versions"] as const

export interface ChangeTrackerOptions {
  syncVersionHistory: boolean
  syncAssets: boolean
  metadataKey: Buffer | null
}

export class ChangeTracker {
  constructor(
    private readonly baseDir: string,
    private readonly options: ChangeTrackerOptions,
  ) {}

  // ── Public API ───────────────────────────────────────────────

  /**
   * Scan local file system and compute content fingerprints for all sync-eligible files.
   * Returns Map<relativePath, fingerprint>.
   */
  async scanLocal(localState: LocalSyncState | null): Promise<Map<string, string>> {
    const result = new Map<string, string>()

    for (const p of SYNC_PATHS) {
      const fullPath = path.join(this.baseDir, p)

      try {
        const s = await stat(fullPath)

        if (s.isDirectory()) {
          await this.scanDirectory(p, localState, result)
        } else {
          const fp = await this.computeFingerprintWithCache(p, fullPath, s, localState)
          result.set(p, fp)
        }
      } catch {
        // file/directory doesn't exist, skip
      }
    }

    for (const p of OPTIONAL_SYNC_PATHS) {
      if (p === "versions" && !this.options.syncVersionHistory) continue
      if (p === "assets" && !this.options.syncAssets) continue

      const fullPath = path.join(this.baseDir, p)

      try {
        const s = await stat(fullPath)

        if (s.isDirectory()) {
          await this.scanDirectory(p, localState, result)
        }
      } catch {
        // directory doesn't exist, skip
      }
    }

    return result
  }

  /**
   * Three-way comparison: local current vs. local baseline vs. remote current.
   * Returns a list of changes to apply.
   */
  computeChanges(
    localCurrent: Map<string, string>,
    localState: LocalSyncState,
    remoteView: MaterializedRemoteView,
  ): FileChange[] {
    const changes: FileChange[] = []
    const allPaths = new Set<string>()

    for (const p of localCurrent.keys()) allPaths.add(p)
    for (const p of Object.keys(localState.files)) allPaths.add(p)
    for (const p of Object.keys(remoteView.files)) allPaths.add(p)

    for (const filePath of allPaths) {
      const localFp = localCurrent.get(filePath) ?? null
      const baseFp = localState.files[filePath]?.baseFingerprint ?? null
      const cloudFp = remoteView.files[filePath]?.fingerprint ?? null

      const change = this.classifyChange(filePath, localFp, baseFp, cloudFp)
      if (change.type !== "none") {
        changes.push(change)
      }
    }

    return changes
  }

  // ── Fingerprint computation ──────────────────────────────────

  computeFingerprint(data: Buffer): string {
    if (this.options.metadataKey) {
      return createHmac("sha256", this.options.metadataKey).update(data).digest("hex")
    }

    return createHash("sha256").update(data).digest("hex")
  }

  async computeFingerprintFromFile(filePath: string): Promise<string> {
    const data = await readFile(filePath)
    return this.computeFingerprint(data)
  }

  // ── Private helpers ──────────────────────────────────────────

  private async computeFingerprintWithCache(
    relativePath: string,
    fullPath: string,
    fileStat: { mtimeMs: number; size: number },
    localState: LocalSyncState | null,
  ): Promise<string> {
    const prev = localState?.files[relativePath]

    if (
      prev?.cachedLocalFingerprint &&
      prev.lastSeenMtimeMs === fileStat.mtimeMs &&
      prev.lastSeenSize === fileStat.size
    ) {
      return prev.cachedLocalFingerprint
    }

    return this.computeFingerprintFromFile(fullPath)
  }

  private async scanDirectory(
    relativeDir: string,
    localState: LocalSyncState | null,
    result: Map<string, string>,
  ): Promise<void> {
    const fullDir = path.join(this.baseDir, relativeDir)
    let entries: import("node:fs").Dirent[]

    try {
      entries = await readdir(fullDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const relativePath = path.join(relativeDir, entry.name)
      const fullPath = path.join(fullDir, entry.name)

      if (entry.isDirectory()) {
        await this.scanDirectory(relativePath, localState, result)
      } else if (entry.isFile()) {
        try {
          const s = await stat(fullPath)
          const fp = await this.computeFingerprintWithCache(relativePath, fullPath, s, localState)
          result.set(relativePath, fp)
        } catch {
          // file disappeared during scan, skip
        }
      }
    }
  }

  private classifyChange(
    filePath: string,
    localFp: string | null,
    baseFp: string | null,
    cloudFp: string | null,
  ): FileChange {
    const base: Omit<FileChange, "type"> = {
      path: filePath,
      localFingerprint: localFp,
      cloudFingerprint: cloudFp,
      baseFingerprint: baseFp,
    }

    // Both sides missing → shouldn't happen (path in set), treat as none
    if (!localFp && !cloudFp) {
      return { ...base, type: "none" }
    }

    // New file: exists locally only, no baseline, no cloud
    if (localFp && !baseFp && !cloudFp) {
      return { ...base, type: "push" }
    }

    // New file from cloud: exists in cloud only, no baseline, no local
    if (!localFp && !baseFp && cloudFp) {
      return { ...base, type: "pull" }
    }

    // Both exist and are the same → no change needed (update baseline if needed)
    if (localFp && cloudFp && localFp === cloudFp) {
      return { ...base, type: "none" }
    }

    // Local deleted, cloud unchanged
    if (!localFp && baseFp && cloudFp && cloudFp === baseFp) {
      return { ...base, type: "delete-remote" }
    }

    // Cloud deleted, local unchanged
    if (localFp && baseFp && !cloudFp && localFp === baseFp) {
      return { ...base, type: "delete-local" }
    }

    // Local deleted, cloud changed → conflict (restore cloud version)
    if (!localFp && baseFp && cloudFp && cloudFp !== baseFp) {
      return { ...base, type: "pull" }
    }

    // Cloud deleted, local changed → conflict (keep local, re-push)
    if (localFp && baseFp && !cloudFp && localFp !== baseFp) {
      return { ...base, type: "push" }
    }

    // Only local modified
    if (localFp && baseFp && cloudFp && localFp !== baseFp && cloudFp === baseFp) {
      return { ...base, type: "push" }
    }

    // Only cloud modified
    if (localFp && baseFp && cloudFp && localFp === baseFp && cloudFp !== baseFp) {
      return { ...base, type: "pull" }
    }

    // Both modified, same result
    if (localFp && baseFp && cloudFp && localFp !== baseFp && cloudFp !== baseFp && localFp === cloudFp) {
      return { ...base, type: "none" }
    }

    // Both modified, different results → conflict
    if (localFp && cloudFp && localFp !== cloudFp) {
      return { ...base, type: "conflict" }
    }

    return { ...base, type: "none" }
  }
}
