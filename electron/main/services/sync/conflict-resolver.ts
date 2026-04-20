import { mkdir, readFile, writeFile, rename, copyFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

import type { ConflictResolution, SyncConflict } from "../../../../src/shared/sync"
import type { CloudStorageProvider } from "./providers/types"
import type { MaterializedRemoteView } from "./types"
import { decrypt } from "./encryption"

export interface ConflictResolverOptions {
  baseDir: string
  provider: CloudStorageProvider
  contentKey: Buffer | null
}

/**
 * Apply a conflict resolution to a single file.
 */
export async function applyConflictResolution(
  conflict: SyncConflict,
  resolution: ConflictResolution,
  options: ConflictResolverOptions,
  remoteView: MaterializedRemoteView,
): Promise<void> {
  const fullPath = path.join(options.baseDir, conflict.filePath)

  switch (resolution) {
    case "keep-local":
      // Do nothing to local file; it will be pushed in next sync cycle
      break

    case "keep-cloud": {
      const remoteFile = remoteView.files[conflict.filePath]
      if (!remoteFile) break

      let data = await options.provider.download(remoteFile.objectKey)

      if (options.contentKey) {
        data = decrypt(data, options.contentKey)
      }

      await mkdir(path.dirname(fullPath), { recursive: true })
      const tmpPath = `${fullPath}.conflict-tmp`
      await writeFile(tmpPath, data)
      await rename(tmpPath, fullPath)
      break
    }

    case "keep-both": {
      // Rename local file with conflict suffix, download cloud version as the original
      const ext = path.extname(conflict.filePath)
      const base = conflict.filePath.slice(0, -ext.length)
      const conflictSuffix = `-conflict-${new Date().toISOString().replace(/[:.]/g, "-")}`
      const conflictPath = path.join(options.baseDir, `${base}${conflictSuffix}${ext}`)

      await mkdir(path.dirname(conflictPath), { recursive: true })
      await copyFile(fullPath, conflictPath)

      // Download cloud version into the original path
      const remoteFile = remoteView.files[conflict.filePath]
      if (remoteFile) {
        let data = await options.provider.download(remoteFile.objectKey)

        if (options.contentKey) {
          data = decrypt(data, options.contentKey)
        }

        const tmpPath = `${fullPath}.conflict-tmp`
        await writeFile(tmpPath, data)
        await rename(tmpPath, fullPath)
      }

      break
    }
  }
}
