import { readFile, stat } from "node:fs/promises"
import path from "node:path"

import type { CloudStorageProvider } from "./providers/types"
import { decrypt } from "./encryption"

export type AssetSyncMode = "full" | "on-demand"

/**
 * Check whether a local asset is available on disk.
 */
export async function isAssetLocallyAvailable(
  baseDir: string,
  assetRelativePath: string,
): Promise<boolean> {
  try {
    const fullPath = path.join(baseDir, assetRelativePath)
    await stat(fullPath)
    return true
  } catch {
    return false
  }
}

/**
 * Download a specific asset from cloud on demand.
 */
export async function downloadAssetOnDemand(
  baseDir: string,
  assetRelativePath: string,
  objectKey: string,
  provider: CloudStorageProvider,
  contentKey: Buffer | null,
): Promise<Buffer> {
  let data = await provider.download(objectKey)

  if (contentKey) {
    data = decrypt(data, contentKey)
  }

  const { mkdir, writeFile, rename } = await import("node:fs/promises")
  const fullPath = path.join(baseDir, assetRelativePath)
  await mkdir(path.dirname(fullPath), { recursive: true })
  const tmpPath = `${fullPath}.dl-tmp`
  await writeFile(tmpPath, data)
  await rename(tmpPath, fullPath)

  return data
}

/**
 * Get all asset paths that need to be synced.
 */
export async function listLocalAssetPaths(baseDir: string): Promise<string[]> {
  const assetsDir = path.join(baseDir, "assets")
  const paths: string[] = []

  try {
    const { readdir } = await import("node:fs/promises")
    const noteDirs = await readdir(assetsDir, { withFileTypes: true })

    for (const noteDir of noteDirs) {
      if (!noteDir.isDirectory()) continue

      const noteAssetDir = path.join(assetsDir, noteDir.name)
      const files = await readdir(noteAssetDir)

      for (const file of files) {
        paths.push(`assets/${noteDir.name}/${file}`)
      }
    }
  } catch {
    // assets dir doesn't exist
  }

  return paths
}
