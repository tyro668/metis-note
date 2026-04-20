import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

import type { S3Config } from "../../../../../src/shared/sync"
import type { CloudStorageProvider, RemoteFileInfo, UploadOptions } from "./types"
import { normalizeS3Config } from "./s3-config"
import { SyncAuthError, SyncError, SyncFileNotFoundError, SyncNetworkError, SyncQuotaError } from "./types"

export class S3Provider implements CloudStorageProvider {
  readonly type = "s3" as const
  private client: S3Client | null = null
  private config: S3Config

  constructor(config: S3Config) {
    this.config = normalizeS3Config(config)
  }

  async initialize(): Promise<void> {
    try {
      await this.createClientAndVerify(this.config.forcePathStyle)
    } catch (error) {
      const fallbackForcePathStyle = this.resolveForcePathStyleFallback(error)

      if (fallbackForcePathStyle !== null && fallbackForcePathStyle !== this.config.forcePathStyle) {
        try {
          await this.createClientAndVerify(fallbackForcePathStyle)
          this.config = {
            ...this.config,
            forcePathStyle: fallbackForcePathStyle,
          }
          return
        } catch (fallbackError) {
          this.client = null
          throw this.wrapError(fallbackError)
        }
      }

      this.client = null
      throw this.wrapError(error)
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.getClient().send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: this.config.prefix,
          MaxKeys: 1,
        }),
      )
      return true
    } catch {
      return false
    }
  }

  async upload(remotePath: string, data: Buffer, options?: UploadOptions): Promise<void> {
    try {
      await this.getClient().send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: this.fullKey(remotePath),
          Body: data,
          ContentType: options?.contentType,
        }),
      )
    } catch (err) {
      throw this.wrapError(err)
    }
  }

  async download(remotePath: string): Promise<Buffer> {
    try {
      const result = await this.getClient().send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: this.fullKey(remotePath),
        }),
      )

      if (!result.Body) {
        throw new SyncFileNotFoundError(remotePath)
      }

      return Buffer.from(await result.Body.transformToByteArray())
    } catch (err: any) {
      if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
        throw new SyncFileNotFoundError(remotePath)
      }

      throw this.wrapError(err)
    }
  }

  async list(remoteDir: string, recursive = true): Promise<RemoteFileInfo[]> {
    const prefix = this.fullKey(remoteDir.endsWith("/") ? remoteDir : `${remoteDir}/`)
    const results: RemoteFileInfo[] = []
    let continuationToken: string | undefined

    try {
      do {
        const response = await this.getClient().send(
          new ListObjectsV2Command({
            Bucket: this.config.bucket,
            Prefix: prefix,
            Delimiter: recursive ? undefined : "/",
            ContinuationToken: continuationToken,
          }),
        )

        // Directories (common prefixes)
        if (response.CommonPrefixes) {
          for (const cp of response.CommonPrefixes) {
            if (cp.Prefix) {
              results.push({
                path: this.stripPrefix(cp.Prefix),
                size: 0,
                lastModified: "",
                isDirectory: true,
              })
            }
          }
        }

        // Files
        if (response.Contents) {
          for (const obj of response.Contents) {
            if (!obj.Key) continue

            results.push({
              path: this.stripPrefix(obj.Key),
              size: obj.Size ?? 0,
              lastModified: obj.LastModified?.toISOString() ?? "",
              isDirectory: false,
            })
          }
        }

        continuationToken = response.NextContinuationToken
      } while (continuationToken)
    } catch (err) {
      throw this.wrapError(err)
    }

    return results
  }

  async delete(remotePath: string): Promise<void> {
    try {
      await this.getClient().send(
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: this.fullKey(remotePath),
        }),
      )
    } catch (err) {
      throw this.wrapError(err)
    }
  }

  async deleteBatch(remotePaths: string[]): Promise<void> {
    if (remotePaths.length === 0) return

    // S3 DeleteObjects supports up to 1000 keys per request
    const batchSize = 1000

    for (let i = 0; i < remotePaths.length; i += batchSize) {
      const batch = remotePaths.slice(i, i + batchSize)

      try {
        await this.getClient().send(
          new DeleteObjectsCommand({
            Bucket: this.config.bucket,
            Delete: {
              Objects: batch.map((p) => ({ Key: this.fullKey(p) })),
              Quiet: true,
            },
          }),
        )
      } catch (err) {
        throw this.wrapError(err)
      }
    }
  }

  async exists(remotePath: string): Promise<boolean> {
    try {
      await this.getClient().send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: this.fullKey(remotePath),
        }),
      )
      return true
    } catch {
      return false
    }
  }

  async getMetadata(remotePath: string): Promise<RemoteFileInfo | null> {
    try {
      const result = await this.getClient().send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: this.fullKey(remotePath),
        }),
      )

      return {
        path: remotePath,
        size: result.ContentLength ?? 0,
        lastModified: result.LastModified?.toISOString() ?? "",
        isDirectory: false,
      }
    } catch {
      return null
    }
  }

  async refreshAuth(): Promise<boolean> {
    // S3 uses long-lived credentials; no refresh needed
    return true
  }

  async dispose(): Promise<void> {
    this.client?.destroy()
    this.client = null
  }

  // ── Helpers ──────────────────────────────────────────────────

  private getClient(): S3Client {
    if (!this.client) {
      throw new SyncAuthError("S3 provider not initialized. Call initialize() first.")
    }

    return this.client
  }

  private async createClientAndVerify(forcePathStyle: boolean): Promise<void> {
    this.client?.destroy()

    const client = new S3Client({
      endpoint: this.config.endpoint || undefined,
      region: this.config.region || "us-east-1",
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      forcePathStyle,
    })

    try {
      await client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: this.config.prefix,
          MaxKeys: 1,
        }),
      )

      this.client = client
    } catch (error) {
      client.destroy()
      throw error
    }
  }

  private resolveForcePathStyleFallback(err: unknown): boolean | null {
    const message = this.getErrorMessage(err).toLowerCase()

    if (
      message.includes("virtual hosted style") ||
      message.includes("virtual-hosted style") ||
      message.includes("virtual-hosted-style")
    ) {
      return false
    }

    if (message.includes("path style") || message.includes("path-style")) {
      return true
    }

    return null
  }

  private getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
  }

  private fullKey(relativePath: string): string {
    const prefix = this.config.prefix.endsWith("/")
      ? this.config.prefix
      : `${this.config.prefix}/`

    return `${prefix}${relativePath}`
  }

  private stripPrefix(key: string): string {
    const prefix = this.config.prefix.endsWith("/")
      ? this.config.prefix
      : `${this.config.prefix}/`

    return key.startsWith(prefix) ? key.slice(prefix.length) : key
  }

  private wrapError(err: unknown): Error {
    const message = this.getErrorMessage(err)

    if (this.resolveForcePathStyleFallback(err) !== null) {
      return new SyncError(`S3 endpoint addressing failed: ${message}`, false)
    }

    if (err instanceof Error) {
      const name = (err as any).name ?? ""
      const statusCode = (err as any)?.$metadata?.httpStatusCode

      if (name === "CredentialsProviderError" || statusCode === 403) {
        return new SyncAuthError(`S3 authentication failed: ${message}`)
      }

      if (statusCode === 402 || name === "QuotaExceeded") {
        return new SyncQuotaError(message)
      }

      if (
        name === "NetworkingError" ||
        name === "TimeoutError" ||
        message.includes("ECONNREFUSED") ||
        message.includes("ENOTFOUND") ||
        message.includes("ETIMEDOUT")
      ) {
        return new SyncNetworkError(message)
      }
    }

    return err instanceof Error ? err : new Error(String(err))
  }
}
