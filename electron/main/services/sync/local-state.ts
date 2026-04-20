import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  DEFAULT_BAIDU_PAN_REMOTE_PATH,
  DEFAULT_GOOGLE_DRIVE_REMOTE_PATH,
  type BaiduPanConfig,
  type GoogleDriveConfig,
  type S3Config,
  type SyncConfig,
} from "../../../../src/shared/sync"
import type { SyncConflict } from "../../../../src/shared/sync"
import type { LocalSyncState } from "./types"
import { normalizeS3Config } from "./providers/s3-config"
import { createEmptyLocalSyncState } from "./types"

const SYNC_DIR = ".sync"
const CONFIG_FILE = "config.json"
const LOCAL_STATE_FILE = "local-state.json"
const CONFLICTS_DIR = "conflicts"

export class LocalStateManager {
  private readonly syncDir: string
  private readonly configPath: string
  private readonly localStatePath: string
  private readonly localStateTmpPath: string
  private readonly conflictsDir: string

  constructor(private readonly baseDir: string) {
    this.syncDir = path.join(baseDir, SYNC_DIR)
    this.configPath = path.join(this.syncDir, CONFIG_FILE)
    this.localStatePath = path.join(this.syncDir, LOCAL_STATE_FILE)
    this.localStateTmpPath = `${this.localStatePath}.tmp`
    this.conflictsDir = path.join(this.syncDir, CONFLICTS_DIR)
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.syncDir, { recursive: true })
    await mkdir(this.conflictsDir, { recursive: true })
  }

  // ── Config ─────────────────────────────────────────────────

  async loadConfig(): Promise<SyncConfig | null> {
    try {
      const data = await readFile(this.configPath, "utf-8")
      const config = this.normalizeConfig(JSON.parse(data) as SyncConfig)

      if (config.version === 1 && config.provider) {
        return config
      }

      return null
    } catch {
      return null
    }
  }

  async saveConfig(config: SyncConfig): Promise<void> {
    await mkdir(this.syncDir, { recursive: true })
    const normalized = this.normalizeConfig(config)
    await writeFile(this.configPath, JSON.stringify(normalized, null, 2))
  }

  normalizeConfig(config: SyncConfig): SyncConfig {
    if (config.provider === "s3") {
      const providerConfig = config.providerConfig as Partial<S3Config>

      return {
        ...config,
        providerConfig: normalizeS3Config(providerConfig),
      }
    }

    if (config.provider === "baidu-pan") {
      const providerConfig = config.providerConfig as Partial<BaiduPanConfig>

      return {
        ...config,
        providerConfig: {
          accessToken: providerConfig.accessToken ?? "",
          refreshToken: providerConfig.refreshToken ?? "",
          expiresAt: providerConfig.expiresAt ?? "",
          remotePath: providerConfig.remotePath ?? DEFAULT_BAIDU_PAN_REMOTE_PATH,
          accountName: providerConfig.accountName ?? null,
          openId: providerConfig.openId ?? null,
        },
      }
    }

    if (config.provider === "google-drive") {
      const providerConfig = config.providerConfig as Partial<GoogleDriveConfig>

      return {
        ...config,
        providerConfig: {
          clientId: providerConfig.clientId ?? "",
          accessToken: providerConfig.accessToken ?? "",
          refreshToken: providerConfig.refreshToken ?? "",
          expiresAt: providerConfig.expiresAt ?? "",
          remotePath: providerConfig.remotePath ?? DEFAULT_GOOGLE_DRIVE_REMOTE_PATH,
          accountEmail: providerConfig.accountEmail ?? null,
          accountName: providerConfig.accountName ?? null,
          userId: providerConfig.userId ?? null,
        },
      }
    }

    return config
  }

  // ── Local sync state ──────────────────────────────────────

  async loadLocalState(deviceId: string): Promise<LocalSyncState> {
    try {
      const data = await readFile(this.localStatePath, "utf-8")
      const state = JSON.parse(data) as LocalSyncState

      if (state.version === 2 && state.deviceId) {
        return {
          ...state,
          noteBaselines: state.noteBaselines ?? {},
        }
      }

      return createEmptyLocalSyncState(deviceId)
    } catch {
      return createEmptyLocalSyncState(deviceId)
    }
  }

  async saveLocalState(state: LocalSyncState): Promise<void> {
    const data = JSON.stringify(state, null, 2)
    await writeFile(this.localStateTmpPath, data)
    await rename(this.localStateTmpPath, this.localStatePath)
  }

  // ── Conflicts ─────────────────────────────────────────────

  async loadConflicts(): Promise<SyncConflict[]> {
    const conflicts: SyncConflict[] = []

    try {
      const { readdir } = await import("node:fs/promises")
      const files = await readdir(this.conflictsDir)

      for (const file of files) {
        if (!file.endsWith(".json")) continue

        try {
          const data = await readFile(path.join(this.conflictsDir, file), "utf-8")
          const conflict = JSON.parse(data) as SyncConflict

          if (conflict.id && conflict.status) {
            conflicts.push(conflict)
          }
        } catch {
          // skip corrupted conflict files
        }
      }
    } catch {
      // conflicts dir doesn't exist yet
    }

    return conflicts
  }

  async saveConflict(conflict: SyncConflict): Promise<void> {
    await mkdir(this.conflictsDir, { recursive: true })
    await writeFile(
      path.join(this.conflictsDir, `${conflict.id}.json`),
      JSON.stringify(conflict, null, 2),
    )
  }

  async deleteConflict(conflictId: string): Promise<void> {
    const { unlink } = await import("node:fs/promises")

    try {
      await unlink(path.join(this.conflictsDir, `${conflictId}.json`))
    } catch {
      // already deleted
    }
  }

  async getPendingConflicts(): Promise<SyncConflict[]> {
    const all = await this.loadConflicts()
    return all.filter((c) => c.status === "pending")
  }
}
