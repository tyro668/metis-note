import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import type { JSONContent } from "@tiptap/core"
import { type AppLocale } from "../../../src/shared/i18n"
import {
  buildPreview,
  countWords,
  extractPlainTextFromContent,
  type NoteDocument,
} from "../../../src/shared/notes"
import type { VersionSummary } from "../../../src/shared/versions"

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000
const SNAPSHOT_PLAIN_TEXT_DELTA = 500
const DAY_MS = 24 * 60 * 60 * 1000

interface VersionFileEntry {
  filePath: string
  filename: string
  timestamp: string
  timestampMs: number
}

export class VersionStore {
  private readonly versionsDir: string
  private initialized = false

  constructor(
    baseDir: string,
    private readonly locale: AppLocale,
  ) {
    this.versionsDir = path.join(baseDir, "versions")
  }

  async ensureReady() {
    if (this.initialized) {
      return
    }

    await mkdir(this.versionsDir, { recursive: true })
    this.initialized = true
  }

  async list(noteId: string): Promise<VersionSummary[]> {
    await this.ensureReady()
    const files = await this.listVersionFiles(noteId)

    return Promise.all(
      files.map(async (entry) => {
        const content = await this.readVersionFile(entry.filePath)
        const plainText = extractPlainTextFromContent(content)

        return {
          timestamp: entry.timestamp,
          wordCount: countWords(plainText),
          previewText: buildPreview(plainText, this.locale),
        } satisfies VersionSummary
      }),
    )
  }

  async get(noteId: string, timestamp: string): Promise<JSONContent | null> {
    await this.ensureReady()
    const filePath = this.versionFilePath(noteId, timestamp)

    try {
      return await this.readVersionFile(filePath)
    } catch {
      return null
    }
  }

  async maybeCreateSnapshot(note: Pick<NoteDocument, "id" | "content" | "plainText">) {
    await this.ensureReady()
    const latest = await this.readLatestSnapshot(note.id)

    if (!latest) {
      await this.writeSnapshot(note.id, note.content)
      return true
    }

    const hasIntervalGap = Date.now() - latest.timestampMs >= SNAPSHOT_INTERVAL_MS
    const hasLargeContentDelta = Math.abs(note.plainText.length - latest.plainText.length) >= SNAPSHOT_PLAIN_TEXT_DELTA

    if (!hasIntervalGap && !hasLargeContentDelta) {
      return false
    }

    await this.writeSnapshot(note.id, note.content)
    return true
  }

  async createSnapshot(note: Pick<NoteDocument, "id" | "content">) {
    await this.ensureReady()
    await this.writeSnapshot(note.id, note.content)
  }

  async deleteNoteVersions(noteId: string) {
    await this.ensureReady()
    await rm(this.noteVersionDir(noteId), { recursive: true, force: true })
  }

  async pruneAll() {
    await this.ensureReady()

    const entries = await readdir(this.versionsDir, { withFileTypes: true })

    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => this.pruneNoteVersions(entry.name)),
    )
  }

  private async pruneNoteVersions(noteId: string) {
    const files = await this.listVersionFiles(noteId)

    if (files.length === 0) {
      return
    }

    const now = Date.now()
    const keep = new Set<string>()
    const hourlyBuckets = new Set<string>()
    const dailyBuckets = new Set<string>()

    for (const entry of files) {
      const age = now - entry.timestampMs

      if (age <= DAY_MS) {
        keep.add(entry.filename)
        continue
      }

      if (age <= 7 * DAY_MS) {
        const bucket = new Date(entry.timestampMs).toISOString().slice(0, 13)

        if (!hourlyBuckets.has(bucket)) {
          hourlyBuckets.add(bucket)
          keep.add(entry.filename)
        }

        continue
      }

      if (age <= 30 * DAY_MS) {
        const bucket = new Date(entry.timestampMs).toISOString().slice(0, 10)

        if (!dailyBuckets.has(bucket)) {
          dailyBuckets.add(bucket)
          keep.add(entry.filename)
        }
      }
    }

    await Promise.all(
      files
        .filter((entry) => !keep.has(entry.filename))
        .map((entry) => rm(entry.filePath, { force: true })),
    )

    const remaining = await readdir(this.noteVersionDir(noteId))

    if (remaining.length === 0) {
      await rm(this.noteVersionDir(noteId), { recursive: true, force: true })
    }
  }

  private async readLatestSnapshot(noteId: string) {
    const [latest] = await this.listVersionFiles(noteId)

    if (!latest) {
      return null
    }

    const content = await this.readVersionFile(latest.filePath)

    return {
      timestamp: latest.timestamp,
      timestampMs: latest.timestampMs,
      plainText: extractPlainTextFromContent(content),
      content,
    }
  }

  private async listVersionFiles(noteId: string): Promise<VersionFileEntry[]> {
    const noteDir = this.noteVersionDir(noteId)

    try {
      const entries = await readdir(noteDir, { withFileTypes: true })

      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => {
          const timestampMs = Number(path.basename(entry.name, ".json"))

          return Number.isFinite(timestampMs)
            ? {
                filePath: path.join(noteDir, entry.name),
                filename: entry.name,
                timestamp: new Date(timestampMs).toISOString(),
                timestampMs,
              }
            : null
        })
        .filter((entry): entry is VersionFileEntry => Boolean(entry))
        .sort((left, right) => right.timestampMs - left.timestampMs)
    } catch {
      return []
    }
  }

  private async writeSnapshot(noteId: string, content: JSONContent) {
    const noteDir = this.noteVersionDir(noteId)
    await mkdir(noteDir, { recursive: true })

    let timestampMs = Date.now()
    let filePath = path.join(noteDir, `${timestampMs}.json`)

    while (await this.pathExists(filePath)) {
      timestampMs += 1
      filePath = path.join(noteDir, `${timestampMs}.json`)
    }

    await writeFile(filePath, JSON.stringify(content, null, 2), "utf-8")
  }

  private async readVersionFile(filePath: string) {
    const raw = await readFile(filePath, "utf-8")

    return JSON.parse(raw) as JSONContent
  }

  private versionFilePath(noteId: string, timestamp: string) {
    const timestampMs = Date.parse(timestamp)

    if (!Number.isFinite(timestampMs)) {
      throw new Error(`Invalid timestamp: ${timestamp}`)
    }

    return path.join(this.noteVersionDir(noteId), `${timestampMs}.json`)
  }

  private noteVersionDir(noteId: string) {
    return path.join(this.versionsDir, noteId)
  }

  private async pathExists(targetPath: string) {
    try {
      await stat(targetPath)
      return true
    } catch {
      return false
    }
  }
}
