import { appendFile, mkdir, readdir, stat, unlink } from "node:fs/promises"
import path from "node:path"

const MAX_LOG_FILES = 10
const MAX_LOG_SIZE = 5 * 1024 * 1024 // 5MB per file

export class SyncLogger {
  private logDir: string
  private currentLogPath: string | null = null
  private currentSize = 0

  constructor(baseDir: string) {
    this.logDir = path.join(baseDir, ".sync", "logs")
  }

  async initialize(): Promise<void> {
    await mkdir(this.logDir, { recursive: true })
    await this.rotateIfNeeded()
    await this.pruneOldLogs()
  }

  async info(message: string, data?: Record<string, unknown>): Promise<void> {
    await this.write("INFO", message, data)
  }

  async warn(message: string, data?: Record<string, unknown>): Promise<void> {
    await this.write("WARN", message, data)
  }

  async error(message: string, data?: Record<string, unknown>): Promise<void> {
    await this.write("ERROR", message, data)
  }

  private async write(level: string, message: string, data?: Record<string, unknown>): Promise<void> {
    const logPath = await this.getLogPath()
    const timestamp = new Date().toISOString()
    const dataStr = data ? ` ${JSON.stringify(data)}` : ""
    const line = `[${timestamp}] [${level}] ${message}${dataStr}\n`

    await appendFile(logPath, line)
    this.currentSize += line.length

    if (this.currentSize >= MAX_LOG_SIZE) {
      this.currentLogPath = null
    }
  }

  private async getLogPath(): Promise<string> {
    if (this.currentLogPath) return this.currentLogPath

    await this.rotateIfNeeded()
    const filename = `sync-${new Date().toISOString().replace(/[:.]/g, "-")}.log`
    this.currentLogPath = path.join(this.logDir, filename)
    this.currentSize = 0
    return this.currentLogPath
  }

  private async rotateIfNeeded(): Promise<void> {
    if (!this.currentLogPath) return

    try {
      const s = await stat(this.currentLogPath)

      if (s.size >= MAX_LOG_SIZE) {
        this.currentLogPath = null
        this.currentSize = 0
      }
    } catch {
      // File doesn't exist yet
    }
  }

  private async pruneOldLogs(): Promise<void> {
    try {
      const files = await readdir(this.logDir)
      const logFiles = files
        .filter((f) => f.startsWith("sync-") && f.endsWith(".log"))
        .sort()

      if (logFiles.length > MAX_LOG_FILES) {
        const toDelete = logFiles.slice(0, logFiles.length - MAX_LOG_FILES)

        for (const file of toDelete) {
          await unlink(path.join(this.logDir, file))
        }
      }
    } catch {
      // Ignore pruning errors
    }
  }
}
