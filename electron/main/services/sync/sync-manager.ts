import { readFile, writeFile, mkdir, unlink, rename } from "node:fs/promises"
import path from "node:path"
import { EventEmitter } from "node:events"

import type {
  NoteSyncState,
  NoteSyncStateMap,
  SyncConfig,
  ConflictResolution,
  SyncConflict,
  SyncProgress,
  SyncResult,
  SyncStatus,
} from "../../../../src/shared/sync"
import type { NoteSummary } from "../../../../src/shared/notes"

import type { CloudStorageProvider } from "./providers/types"
import { SyncError, SyncNetworkError, SyncAuthError } from "./providers/types"
import type {
  CommitManifest,
  FileChange,
  LocalFileEntry,
  LocalSyncState,
  MaterializedRemoteView,
  StagedObject,
} from "./types"

import { ChangeTracker, type ChangeTrackerOptions } from "./change-tracker"
import { CommitLog } from "./commit-log"
import { LocalStateManager } from "./local-state"
import { loadSnapshot, materializeRemoteView, advanceCursor } from "./remote-view"
import { deriveKeys, decrypt, type DerivedSyncKeys } from "./encryption"
import { S3Provider } from "./providers/s3"
import { BaiduPanProvider } from "./providers/baidu-pan"
import { GoogleDriveProvider } from "./providers/google-drive"
import { WebDAVProvider } from "./providers/webdav"
import { BaiduPanBrokerClient } from "./baidu-pan-broker"
import { GoogleDriveAuthService } from "./google-drive-auth"

// ─── Events ────────────────────────────────────────────────────

export interface SyncManagerEvents {
  "status-changed": (status: SyncStatus) => void
  "progress": (progress: SyncProgress) => void
  "conflict-detected": (conflict: SyncConflict) => void
  "sync-completed": (result: SyncResult) => void
}

// ─── SyncManager ───────────────────────────────────────────────

export class SyncManager extends EventEmitter {
  private provider: CloudStorageProvider | null = null
  private config: SyncConfig | null = null
  private derivedKeys: DerivedSyncKeys | null = null
  private localStateManager: LocalStateManager
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private syncInProgress = false
  private syncPromise: Promise<SyncResult> | null = null
  private status: SyncStatus = { state: "not-configured" }
  private disposed = false

  constructor(
    private readonly baseDir: string,
    private readonly baiduPanBrokerClient: BaiduPanBrokerClient,
    private readonly googleDriveAuthService: GoogleDriveAuthService,
  ) {
    super()
    this.localStateManager = new LocalStateManager(baseDir)
  }

  // ── Lifecycle ────────────────────────────────────────────────

  async initialize(): Promise<void> {
    await this.localStateManager.ensureReady()
    const config = await this.localStateManager.loadConfig()

    if (!config || !config.enabled) {
      this.setStatus(config ? { state: "disabled" } : { state: "not-configured" })
      return
    }

    this.config = config
    const initialized = await this.initProvider()

    if (initialized) {
      this.triggerBackgroundSync()
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.stopScheduler()

    if (this.provider) {
      await this.provider.dispose()
      this.provider = null
    }
  }

  // ── Configuration ────────────────────────────────────────────

  async configure(config: SyncConfig): Promise<void> {
    this.stopScheduler()

    if (this.provider) {
      await this.provider.dispose()
      this.provider = null
    }

    const normalizedConfig = this.localStateManager.normalizeConfig(config)

    this.config = normalizedConfig
    await this.localStateManager.saveConfig(normalizedConfig)

    if (!normalizedConfig.enabled) {
      this.setStatus({ state: "disabled" })
      return
    }

    const initialized = await this.initProvider()

    if (initialized) {
      this.triggerBackgroundSync()
    }
  }

  getConfig(): SyncConfig | null {
    return this.config
  }

  getStatus(): SyncStatus {
    return this.status
  }

  async getNoteSyncStates(notes: Array<Pick<NoteSummary, "id" | "updatedAt">>): Promise<NoteSyncStateMap> {
    if (!this.config?.enabled) {
      return {}
    }

    const localState = await this.localStateManager.loadLocalState(this.config.deviceId)
    const pendingConflicts = await this.localStateManager.getPendingConflicts()
    const conflictNoteIds = new Set(
      pendingConflicts
        .map((conflict) => this.extractNoteId(conflict.filePath))
        .filter((noteId): noteId is string => Boolean(noteId)),
    )
    const noteSyncStates: NoteSyncStateMap = {}

    for (const note of notes) {
      if (conflictNoteIds.has(note.id)) {
        noteSyncStates[note.id] = "conflict"
        continue
      }

      const baseState = this.getLocalNoteSyncState(note, localState)

      if (baseState !== "synced" && this.isSyncingNote(note.id)) {
        noteSyncStates[note.id] = "syncing"
        continue
      }

      noteSyncStates[note.id] = baseState
    }

    return noteSyncStates
  }

  // ── Manual sync trigger ──────────────────────────────────────

  async syncNow(): Promise<SyncResult> {
    if (!this.config || !this.config.enabled) {
      return { status: "skipped", reason: "Sync is not enabled" }
    }

    if (!this.provider) {
      const initialized = await this.initProvider()

      if (!initialized || !this.provider) {
        return {
          status: "error",
          error: this.status.state === "error" ? this.status.message : "Provider not initialized",
        }
      }
    }

    return this.runOrJoinSyncCycle()
  }

  // ── Conflict resolution ──────────────────────────────────────

  async resolveConflict(conflictId: string, resolution: ConflictResolution): Promise<void> {
    const conflicts = await this.localStateManager.loadConflicts()
    const conflict = conflicts.find((c) => c.id === conflictId)

    if (!conflict || conflict.status !== "pending") return

    conflict.resolution = resolution
    conflict.status = "resolved"
    await this.localStateManager.saveConflict(conflict)

    // Check remaining pending conflicts
    const pending = await this.localStateManager.getPendingConflicts()

    if (pending.length === 0 && this.status.state === "conflict") {
      this.setStatus({ state: "idle" })
    }
  }

  async getPendingConflicts(): Promise<SyncConflict[]> {
    return this.localStateManager.getPendingConflicts()
  }

  // ── Core sync cycle ──────────────────────────────────────────

  private async executeSyncCycle(): Promise<SyncResult> {
    if (!this.config || !this.provider) {
      return { status: "error", error: "Not configured" }
    }

    this.syncInProgress = true
    const progress: SyncProgress = {
      phase: "scanning",
      totalFiles: 0,
      completedFiles: 0,
      totalBytes: 0,
      transferredBytes: 0,
      currentFile: null,
    }
    this.setStatus({ state: "syncing", phase: "scanning", progress })

    try {
      // Derive encryption keys if encryption is enabled
      if (this.config.encryption?.enabled && !this.derivedKeys) {
        // Keys must be derived externally via setPassphrase()
        return { status: "error", error: "Encryption passphrase not set" }
      }

      const metadataKey = this.derivedKeys?.metadataKey ?? null
      const contentKey = this.derivedKeys?.contentKey ?? null

      // 1. Scan local files
      const changeTracker = new ChangeTracker(this.baseDir, {
        syncVersionHistory: this.config.syncVersionHistory,
        syncAssets: this.config.assetSyncMode === "full",
        metadataKey,
      })

      const localState = await this.localStateManager.loadLocalState(this.config.deviceId)
      const localCurrent = await changeTracker.scanLocal(localState)

      // 2. Load snapshot + new commits → materialize remote view
      this.updateProgress(progress, "comparing")
      const snapshot = await loadSnapshot(this.provider)
      const commitLog = new CommitLog(this.provider, this.config, changeTracker, contentKey)
      const newCommits = await commitLog.listCommitsAfterCursor(localState.lastAppliedCursor)
      const remoteView = materializeRemoteView(snapshot, newCommits)

      // 3. Three-way comparison
      const changes = await this.normalizeBootstrapChanges(
        localCurrent,
        remoteView,
        changeTracker.computeChanges(localCurrent, localState, remoteView),
      )

      if (changes.length === 0) {
        this.updateProgress(progress, "finalizing")
        localState.lastSuccessfulSyncAt = new Date().toISOString()
        await this.refreshNoteBaselines(localState)
        await this.localStateManager.saveLocalState(localState)
        this.setStatus({ state: "idle" })
        const result: SyncResult = {
          status: "success",
          pushed: 0,
          pulled: 0,
          conflicts: 0,
          deletedRemote: 0,
          deletedLocal: 0,
          timestamp: new Date().toISOString(),
        }
        this.emit("sync-completed", result)
        return result
      }

      // Categorize changes
      const pushes = changes.filter((c) => c.type === "push")
      const pulls = changes.filter((c) => c.type === "pull")
      const conflicts = changes.filter((c) => c.type === "conflict")
      const deleteRemote = changes.filter((c) => c.type === "delete-remote")
      const deleteLocal = changes.filter((c) => c.type === "delete-local")

      progress.totalFiles = changes.length

      // 4. Handle conflicts
      if (conflicts.length > 0) {
        await this.handleConflicts(conflicts, remoteView)
      }

      // 5. Upload (push changes)
      if (pushes.length > 0 || deleteRemote.length > 0) {
        this.updateProgress(progress, "uploading")
        const stagedObjects: StagedObject[] = []

        for (const change of pushes) {
          const fullPath = path.join(this.baseDir, change.path)

          try {
            const data = await readFile(fullPath)
            const fingerprint = change.localFingerprint!
            const staged = await commitLog.stageObject(change.path, data, fingerprint)
            stagedObjects.push(staged)
            progress.completedFiles++
            progress.currentFile = change.path
            this.emit("progress", { ...progress })
          } catch {
            // File disappeared
          }
        }

        if (stagedObjects.length > 0 || deleteRemote.length > 0) {
          await commitLog.uploadObjects(stagedObjects)
          const commit = await commitLog.publishCommit({
            changes: pushes,
            stagedObjects,
            deletions: deleteRemote,
            remoteView,
            localLamport: localState.lastLamport,
          })

          if (commit) {
            // Update local state with new baseline
            for (const obj of stagedObjects) {
              localState.files[obj.path] = {
                baseFingerprint: obj.fingerprint,
                baseRevision: (remoteView.files[obj.path]?.revision ?? 0) + 1,
                cachedLocalFingerprint: obj.fingerprint,
                lastSeenMtimeMs: null,
                lastSeenSize: null,
                localPath: obj.path,
              }
            }

            for (const del of deleteRemote) {
              delete localState.files[del.path]
            }

            localState.lastLamport = commit.lamport
            localState.lastAppliedCursor = advanceCursor(
              localState.lastAppliedCursor,
              newCommits,
              commit,
            )
          }
        }
      }

      // 6. Download (pull changes)
      if (pulls.length > 0 || deleteLocal.length > 0) {
        this.updateProgress(progress, "downloading")

        for (const change of pulls) {
          const remoteFile = remoteView.files[change.path]
          if (!remoteFile) continue

          try {
            let data = await this.provider.download(remoteFile.objectKey)

            if (contentKey) {
              data = decrypt(data, contentKey)
            }

            const fullPath = path.join(this.baseDir, change.path)
            await mkdir(path.dirname(fullPath), { recursive: true })
            const tmpPath = `${fullPath}.sync-tmp`
            await writeFile(tmpPath, data)
            await rename(tmpPath, fullPath)

            localState.files[change.path] = {
              baseFingerprint: remoteFile.fingerprint,
              baseRevision: remoteFile.revision,
              cachedLocalFingerprint: remoteFile.fingerprint,
              lastSeenMtimeMs: null,
              lastSeenSize: null,
              localPath: change.path,
            }

            progress.completedFiles++
            progress.currentFile = change.path
            this.emit("progress", { ...progress })
          } catch {
            // Download failed for this file
          }
        }

        // Handle local deletions
        for (const change of deleteLocal) {
          const fullPath = path.join(this.baseDir, change.path)

          try {
            await unlink(fullPath)
          } catch {
            // Already deleted
          }

          delete localState.files[change.path]
          progress.completedFiles++
        }

        // Advance cursor after pulling
        localState.lastAppliedCursor = advanceCursor(
          localState.lastAppliedCursor,
          newCommits,
          null,
        )
      }

      // 7. Persist local state
      this.updateProgress(progress, "finalizing")
      localState.lastSuccessfulSyncAt = new Date().toISOString()
      await this.refreshNoteBaselines(localState)
      await this.localStateManager.saveLocalState(localState)

      // 8. Set final status
      const pendingConflicts = await this.localStateManager.getPendingConflicts()

      if (pendingConflicts.length > 0) {
        this.setStatus({ state: "conflict", pendingCount: pendingConflicts.length })
      } else {
        this.setStatus({ state: "idle" })
      }

      const isNoteFile = (p: string) => p.startsWith("items/") && p.endsWith(".json")
      const result: SyncResult = {
        status: "success",
        pushed: pushes.filter((c) => isNoteFile(c.path)).length,
        pulled: pulls.filter((c) => isNoteFile(c.path)).length,
        conflicts: conflicts.filter((c) => isNoteFile(c.path)).length,
        deletedRemote: deleteRemote.filter((c) => isNoteFile(c.path)).length,
        deletedLocal: deleteLocal.filter((c) => isNoteFile(c.path)).length,
        timestamp: new Date().toISOString(),
      }

      this.emit("sync-completed", result)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const retryable = err instanceof SyncError ? err.retryable : false

      this.setStatus({
        state: "error",
        message,
        retryAt: retryable ? new Date(Date.now() + 30_000).toISOString() : null,
      })

      return { status: "error", error: message }
    } finally {
      this.syncInProgress = false
    }
  }

  // ── Conflict handling ────────────────────────────────────────

  private async handleConflicts(
    conflicts: FileChange[],
    remoteView: MaterializedRemoteView,
  ): Promise<void> {
    for (const change of conflicts) {
      const remoteFile = remoteView.files[change.path]

      const conflict: SyncConflict = {
        id: `${Date.now()}-${change.path.replace(/\//g, "-")}`,
        filePath: change.path,
        noteTitle: this.extractNoteTitle(change.path),
        detectedAt: new Date().toISOString(),
        localVersion: {
          fingerprint: change.localFingerprint ?? "",
          updatedAt: new Date().toISOString(),
          deviceId: this.config!.deviceId,
          deviceName: this.config!.deviceName,
          wordCount: 0,
        },
        cloudVersion: {
          fingerprint: change.cloudFingerprint ?? "",
          updatedAt: remoteFile?.updatedAt ?? "",
          deviceId: remoteFile?.updatedBy ?? "",
          deviceName: "",
          revision: remoteFile?.revision ?? 0,
          wordCount: 0,
        },
        status: "pending",
        resolution: null,
      }

      await this.localStateManager.saveConflict(conflict)
      this.emit("conflict-detected", conflict)
    }
  }

  private extractNoteTitle(filePath: string): string {
    return this.extractNoteId(filePath) ?? filePath
  }

  private extractNoteId(filePath: string | null): string | null {
    if (!filePath) {
      return null
    }

    const match = filePath.match(/^items\/(.+)\.json$/)
    return match ? match[1] : null
  }

  private async computeDirectionalNoteSyncStates(
    notes: Array<Pick<NoteSummary, "id" | "updatedAt">>,
    localState: LocalSyncState,
  ): Promise<Partial<NoteSyncStateMap>> {
    if (!this.config) {
      return {}
    }

    if (this.config.encryption && !this.derivedKeys) {
      return {}
    }

    if (!this.provider) {
      const initialized = await this.initProvider()

      if (!initialized || !this.provider) {
        return {}
      }
    }

    const metadataKey = this.derivedKeys?.metadataKey ?? null
    const contentKey = this.derivedKeys?.contentKey ?? null
    const changeTracker = new ChangeTracker(this.baseDir, {
      syncVersionHistory: this.config.syncVersionHistory,
      syncAssets: this.config.assetSyncMode === "full",
      metadataKey,
    })
    const localCurrent = await changeTracker.scanLocal(localState)
    const snapshot = await loadSnapshot(this.provider)
    const commitLog = new CommitLog(this.provider, this.config, changeTracker, contentKey)
    const newCommits = await commitLog.listCommitsAfterCursor(localState.lastAppliedCursor)
    const remoteView = materializeRemoteView(snapshot, newCommits)
    const changes = await this.normalizeBootstrapChanges(
      localCurrent,
      remoteView,
      changeTracker.computeChanges(localCurrent, localState, remoteView),
    )
    const statesByNoteId: Partial<NoteSyncStateMap> = {}

    for (const change of changes) {
      const noteId = this.extractNoteId(change.path)

      if (!noteId) {
        continue
      }

      const nextState = this.mapFileChangeToNoteSyncState(change)

      if (!nextState) {
        continue
      }

      statesByNoteId[noteId] = this.mergeNoteSyncStates(statesByNoteId[noteId], nextState)
    }

    const remoteNoteUpdates = await this.loadRemoteNoteUpdatedAtMap(remoteView, contentKey)

    if (!remoteNoteUpdates) {
      return statesByNoteId
    }

    for (const note of notes) {
      const baseUpdatedAt = localState.noteBaselines[note.id]?.syncedUpdatedAt ?? null
      const remoteUpdatedAt = remoteNoteUpdates.get(note.id) ?? null
      const metadataState = this.classifyNoteMetadataSyncState(note.updatedAt, baseUpdatedAt, remoteUpdatedAt)

      if (metadataState === "synced") {
        continue
      }

      statesByNoteId[note.id] = this.mergeNoteSyncStates(statesByNoteId[note.id], metadataState)
    }

    return statesByNoteId
  }

  private getLocalNoteSyncState(
    note: Pick<NoteSummary, "id" | "updatedAt">,
    localState: LocalSyncState,
  ): NoteSyncState {
    const syncedUpdatedAt = localState.noteBaselines[note.id]?.syncedUpdatedAt ?? null

    return syncedUpdatedAt !== note.updatedAt ? "upload-pending" : "synced"
  }

  private mapFileChangeToNoteSyncState(change: FileChange): NoteSyncState | null {
    switch (change.type) {
      case "push":
      case "delete-remote":
        return "upload-pending"
      case "pull":
      case "delete-local":
        return "download-pending"
      case "conflict":
        return "conflict"
      default:
        return null
    }
  }

  private mergeNoteSyncStates(
    current: NoteSyncState | undefined,
    next: NoteSyncState,
  ): NoteSyncState {
    if (current === "conflict" || next === "conflict") {
      return "conflict"
    }

    if (!current || current === "synced") {
      return next
    }

    return current
  }

  private async loadRemoteNoteUpdatedAtMap(
    remoteView: MaterializedRemoteView,
    contentKey: Buffer | null,
  ): Promise<Map<string, string> | null> {
    const remoteIndex = remoteView.files["index.json"]

    if (!remoteIndex || !this.provider) {
      return null
    }

    try {
      let data = await this.provider.download(remoteIndex.objectKey)

      if (contentKey) {
        data = decrypt(data, contentKey)
      }

      const payload = JSON.parse(data.toString("utf-8")) as {
        notes?: Array<{
          id?: string
          updatedAt?: string
        }>
      }

      return new Map(
        (payload.notes ?? [])
          .filter((note): note is { id: string; updatedAt: string } => Boolean(note.id && note.updatedAt))
          .map((note) => [note.id, note.updatedAt]),
      )
    } catch {
      return null
    }
  }

  private classifyNoteMetadataSyncState(
    localUpdatedAt: string,
    baseUpdatedAt: string | null,
    remoteUpdatedAt: string | null,
  ): NoteSyncState {
    const localChanged = baseUpdatedAt !== localUpdatedAt
    const remoteChanged = baseUpdatedAt !== remoteUpdatedAt

    if (localChanged && remoteChanged) {
      if (remoteUpdatedAt === localUpdatedAt) {
        return "synced"
      }

      return remoteUpdatedAt ? "conflict" : "upload-pending"
    }

    if (localChanged && !remoteChanged) {
      return "upload-pending"
    }

    if (!localChanged && remoteChanged) {
      return "download-pending"
    }

    return "synced"
  }

  private async normalizeBootstrapChanges(
    localCurrent: Map<string, string>,
    remoteView: MaterializedRemoteView,
    changes: FileChange[],
  ): Promise<FileChange[]> {
    const remoteHasIndex = Boolean(remoteView.files["index.json"])
    const localHasIndex = localCurrent.has("index.json")
    const localIndexEmpty = localHasIndex ? await this.isLocalIndexEmpty() : false

    return changes.map((change) => {
      if (!remoteHasIndex && localHasIndex && change.type === "delete-local" && localCurrent.has(change.path)) {
        return {
          ...change,
          type: "push",
          localFingerprint: localCurrent.get(change.path) ?? change.localFingerprint,
        }
      }

      if (remoteHasIndex && localIndexEmpty && change.path === "index.json" && change.type !== "none") {
        return {
          ...change,
          type: "pull",
        }
      }

      return change
    })
  }

  private async isLocalIndexEmpty(): Promise<boolean> {
    const indexPath = path.join(this.baseDir, "index.json")

    try {
      const raw = await readFile(indexPath, "utf-8")
      const payload = JSON.parse(raw) as { notes?: unknown[] }

      return !Array.isArray(payload.notes) || payload.notes.length === 0
    } catch {
      return false
    }
  }

  // ── Passphrase ───────────────────────────────────────────────

  setPassphrase(passphrase: string): void {
    if (!this.config?.encryption) return

    this.derivedKeys = deriveKeys(
      passphrase,
      Buffer.from(this.config.encryption.salt, "hex"),
    )
  }

  clearPassphrase(): void {
    this.derivedKeys = null
  }

  // ── Provider initialization ──────────────────────────────────

  private async initProvider(): Promise<boolean> {
    if (!this.config) return false

    try {
      const provider = this.createProvider(this.config)
      await provider.initialize()
      this.provider = provider
      this.startScheduler()
      this.setStatus({ state: "idle" })
      return true
    } catch (error) {
      this.provider = null

      const retryAt =
        error instanceof SyncError && error.retryable
          ? new Date(Date.now() + 60_000).toISOString()
          : null
      const message = error instanceof Error ? error.message : String(error)

      console.error("[metis-note] Failed to initialize sync provider.", error)
      this.setStatus({
        state: "error",
        message,
        retryAt,
      })
      return false
    }
  }

  private createProvider(config: SyncConfig): CloudStorageProvider {
    switch (config.provider) {
      case "s3":
        return new S3Provider(config.providerConfig as import("../../../../src/shared/sync").S3Config)
      case "baidu-pan":
        return new BaiduPanProvider(
          config.providerConfig as import("../../../../src/shared/sync").BaiduPanConfig,
          {
            refreshTokens: (refreshToken) => this.baiduPanBrokerClient.refreshTokens(refreshToken),
            onTokenRefreshed: (updated) => {
              if (this.config) {
                this.config = { ...this.config, providerConfig: updated }
                this.localStateManager.saveConfig(this.config).catch(() => {})
              }
            },
          },
        )
      case "google-drive":
        return new GoogleDriveProvider(
          config.providerConfig as import("../../../../src/shared/sync").GoogleDriveConfig,
          {
            refreshTokens: (clientId, refreshToken) =>
              this.googleDriveAuthService.refreshTokens(clientId, refreshToken),
            onTokenRefreshed: (updated) => {
              if (this.config) {
                this.config = { ...this.config, providerConfig: updated }
                this.localStateManager.saveConfig(this.config).catch(() => {})
              }
            },
          },
        )
      case "webdav":
        return new WebDAVProvider(config.providerConfig as import("../../../../src/shared/sync").WebDAVConfig)
      default:
        throw new Error(`Unknown provider: ${config.provider}`)
    }
  }

  // ── Scheduler ────────────────────────────────────────────────

  private startScheduler(): void {
    if (!this.config) return
    if (this.syncTimer) return

    const interval = this.config.syncInterval * 1000 // seconds → ms
    this.syncTimer = setInterval(() => {
      if (!this.syncInProgress && !this.disposed) {
        this.executeSyncCycle().catch(() => {})
      }
    }, interval)
  }

  private stopScheduler(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
  }

  private triggerBackgroundSync(): void {
    if (!this.config || !this.provider || this.syncInProgress || this.disposed) {
      return
    }

    void this.runOrJoinSyncCycle().catch(() => {})
  }

  private runOrJoinSyncCycle(): Promise<SyncResult> {
    if (this.syncPromise) {
      return this.syncPromise
    }

    const cyclePromise = this.executeSyncCycle().finally(() => {
      if (this.syncPromise === cyclePromise) {
        this.syncPromise = null
      }
    })

    this.syncPromise = cyclePromise
    return cyclePromise
  }

  private isSyncingNote(noteId: string): boolean {
    if (this.status.state !== "syncing") {
      return false
    }

    if (this.status.phase === "scanning" || this.status.phase === "comparing") {
      return true
    }

    if (this.status.progress.currentFile === "index.json") {
      return true
    }

    return this.extractNoteId(this.status.progress.currentFile) === noteId
  }

  private async refreshNoteBaselines(localState: LocalSyncState): Promise<void> {
    const indexPath = path.join(this.baseDir, "index.json")

    try {
      const raw = await readFile(indexPath, "utf-8")
      const payload = JSON.parse(raw) as {
        notes?: Array<{
          id?: string
          updatedAt?: string
        }>
      }

      localState.noteBaselines = Object.fromEntries(
        (payload.notes ?? [])
          .filter((note): note is { id: string; updatedAt: string } => Boolean(note.id && note.updatedAt))
          .map((note) => [
            note.id,
            {
              syncedUpdatedAt: note.updatedAt,
            },
          ]),
      )
    } catch {
      localState.noteBaselines = {}
    }
  }

  // ── Status management ────────────────────────────────────────

  private setStatus(status: SyncStatus): void {
    this.status = status
    this.emit("status-changed", status)
  }

  private updateProgress(progress: SyncProgress, phase: SyncProgress["phase"]): void {
    progress.phase = phase
    this.setStatus({ state: "syncing", phase, progress: { ...progress } })
    this.emit("progress", { ...progress })
  }
}
