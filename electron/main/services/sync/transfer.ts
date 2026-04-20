import type { CloudStorageProvider } from "./providers/types"
import type { StagedObject } from "./types"

const MAX_CONCURRENT = 5

/**
 * Upload staged objects with concurrency control.
 */
export async function uploadWithConcurrency(
  objects: StagedObject[],
  provider: CloudStorageProvider,
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  let completed = 0
  const total = objects.length

  const queue = [...objects]

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const obj = queue.shift()
      if (!obj) break

      const exists = await provider.exists(obj.objectKey)

      if (!exists) {
        await provider.upload(obj.objectKey, obj.data)
      }

      completed++
      onProgress?.(completed, total)
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, objects.length) }, () => worker())
  await Promise.all(workers)
}

/**
 * Download multiple files with concurrency control.
 */
export async function downloadWithConcurrency(
  items: Array<{ remotePath: string; objectKey: string }>,
  provider: CloudStorageProvider,
  onItem: (remotePath: string, data: Buffer) => Promise<void>,
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  let completed = 0
  const total = items.length
  const queue = [...items]

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break

      const data = await provider.download(item.objectKey)
      await onItem(item.remotePath, data)
      completed++
      onProgress?.(completed, total)
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, items.length) }, () => worker())
  await Promise.all(workers)
}
