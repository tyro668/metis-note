import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import type { NoteLinkResolutionMap, NoteSummary } from "../../../src/shared/notes"

interface NoteLinksPayload {
  version: 1
  outgoing: Record<string, string[]>
}

const EMPTY_PAYLOAD: NoteLinksPayload = {
  version: 1,
  outgoing: {},
}

function normalizeOutgoingMap(outgoing: unknown) {
  if (!outgoing || typeof outgoing !== "object") {
    return {}
  }

  return Object.fromEntries(
    Object.entries(outgoing)
      .filter(([sourceId]) => typeof sourceId === "string" && sourceId.trim())
      .map(([sourceId, targets]) => [
        sourceId.trim(),
        Array.isArray(targets)
          ? [
              ...new Set(
                targets
                  .filter((targetId): targetId is string => typeof targetId === "string" && targetId.trim().length > 0)
                  .map((targetId) => targetId.trim()),
              ),
            ]
          : [],
      ])
      .filter(([, targets]) => targets.length > 0),
  )
}

export class NoteLinkStore {
  private readonly linksPath: string
  private readonly tempPath: string
  private initialized = false
  private mutationQueue = Promise.resolve()
  private outgoing = new Map<string, string[]>()
  private backlinks = new Map<string, Set<string>>()

  constructor(private readonly baseDir: string) {
    this.linksPath = path.join(baseDir, "links.json")
    this.tempPath = `${this.linksPath}.tmp`
  }

  async ensureReady() {
    if (this.initialized) {
      return
    }

    await mkdir(this.baseDir, { recursive: true })

    try {
      await stat(this.linksPath)
    } catch {
      await this.writePayload(EMPTY_PAYLOAD)
    }

    const payload = await this.readPayload()
    const normalizedPayload: NoteLinksPayload = {
      version: 1,
      outgoing: normalizeOutgoingMap(payload.outgoing),
    }

    this.applyPayload(normalizedPayload)

    if (payload.version !== 1 || JSON.stringify(payload.outgoing) !== JSON.stringify(normalizedPayload.outgoing)) {
      await this.writePayload(normalizedPayload)
    }

    this.initialized = true
  }

  async replaceAllOutgoing(outgoing: Record<string, string[]>) {
    await this.ensureReady()

    const normalizedPayload: NoteLinksPayload = {
      version: 1,
      outgoing: normalizeOutgoingMap(outgoing),
    }

    await this.enqueueMutation(async () => {
      await this.writePayload(normalizedPayload)
      this.applyPayload(normalizedPayload)
    })
  }

  async updateOutgoing(sourceId: string, targetIds: string[]) {
    await this.ensureReady()

    const normalizedSourceId = sourceId.trim()

    if (!normalizedSourceId) {
      return
    }

    const normalizedTargets = [...new Set(targetIds.map((targetId) => targetId.trim()).filter(Boolean))]

    await this.enqueueMutation(async () => {
      const payload = await this.readPayload()

      if (normalizedTargets.length > 0) {
        payload.outgoing[normalizedSourceId] = normalizedTargets
      } else {
        delete payload.outgoing[normalizedSourceId]
      }

      const normalizedPayload: NoteLinksPayload = {
        version: 1,
        outgoing: normalizeOutgoingMap(payload.outgoing),
      }

      await this.writePayload(normalizedPayload)
      this.applyPayload(normalizedPayload)
    })
  }

  async removeOutgoing(sourceId: string) {
    await this.ensureReady()

    const normalizedSourceId = sourceId.trim()

    if (!normalizedSourceId) {
      return
    }

    await this.enqueueMutation(async () => {
      const payload = await this.readPayload()
      delete payload.outgoing[normalizedSourceId]
      const normalizedPayload: NoteLinksPayload = {
        version: 1,
        outgoing: normalizeOutgoingMap(payload.outgoing),
      }
      await this.writePayload(normalizedPayload)
      this.applyPayload(normalizedPayload)
    })
  }

  getBacklinks(targetNoteId: string, notes: NoteSummary[]) {
    const notesById = new Map(notes.map((note) => [note.id, note]))

    return [...(this.backlinks.get(targetNoteId) ?? [])]
      .filter((sourceId) => sourceId !== targetNoteId)
      .map((sourceId) => notesById.get(sourceId) ?? null)
      .filter((note): note is NoteSummary => note !== null && note.status === "active")
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
  }

  resolveLinks(noteIds: string[], notes: NoteSummary[]): NoteLinkResolutionMap {
    const notesById = new Map(notes.map((note) => [note.id, note]))

    return Object.fromEntries(
      [...new Set(noteIds.map((noteId) => noteId.trim()).filter(Boolean))].map((noteId) => {
        const note = notesById.get(noteId)

        return [
          noteId,
          {
            title: note?.title ?? "",
            exists: note?.status === "active",
          },
        ]
      }),
    )
  }

  private async readPayload(): Promise<NoteLinksPayload> {
    try {
      const raw = await readFile(this.linksPath, "utf-8")
      const parsed = JSON.parse(raw) as Partial<NoteLinksPayload>

      return {
        version: parsed.version === 1 ? 1 : 1,
        outgoing: normalizeOutgoingMap(parsed.outgoing),
      }
    } catch (error) {
      const backupPath = path.join(this.baseDir, `links.corrupted-${Date.now()}.json`)

      try {
        await rename(this.linksPath, backupPath)
      } catch {
        // Ignore backup failures and continue with a clean index.
      }

      await this.writePayload(EMPTY_PAYLOAD)

      if (error instanceof Error) {
        console.warn("[metis-note] Recovered corrupted note link index.", error)
      }

      return {
        version: 1,
        outgoing: {},
      }
    }
  }

  private async writePayload(payload: NoteLinksPayload) {
    const serialized = JSON.stringify(payload, null, 2)
    await writeFile(this.tempPath, serialized, "utf-8")
    await rename(this.tempPath, this.linksPath)
  }

  private applyPayload(payload: NoteLinksPayload) {
    this.outgoing = new Map(Object.entries(payload.outgoing))
    this.backlinks = new Map()

    for (const [sourceId, targetIds] of this.outgoing.entries()) {
      for (const targetId of targetIds) {
        if (!targetId || targetId === sourceId) {
          continue
        }

        const current = this.backlinks.get(targetId) ?? new Set<string>()
        current.add(sourceId)
        this.backlinks.set(targetId, current)
      }
    }
  }

  private async enqueueMutation<T>(operation: () => Promise<T>) {
    const task = this.mutationQueue.then(operation, operation)
    this.mutationQueue = task.then(
      () => undefined,
      () => undefined,
    )

    return task
  }
}
