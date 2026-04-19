import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import type { JSONContent } from "@tiptap/core"
import { getMessages, type AppLocale } from "../../../src/shared/i18n"
import {
  buildPreview,
  countWords,
  createEmptyDocument,
  extractNoteLinkIds,
  createWelcomeDocument,
  normalizeTags,
  normalizeTitle,
  normalizeWorkspaceName,
  type CreateNoteInput,
  type DeleteNoteResult,
  type NoteDocument,
  type NoteStatus,
  type NoteSummary,
  type NoteVisibility,
  type NoteWorkspace,
  type UpdateNoteInput,
} from "../../../src/shared/notes"
import { AssetStore } from "./asset-store"
import { NoteLinkStore } from "./note-link-store"
import { VersionStore } from "./version-store"

interface LegacyNoteSummaryV1 {
  id: string
  title?: string
  preview?: string
  createdAt?: string
  updatedAt?: string
  wordCount?: number
}

type StoredSummary = Partial<NoteSummary> & LegacyNoteSummaryV1

interface NoteIndexPayload {
  version: 4
  notes: NoteSummary[]
}

export class NoteStore {
  private readonly notesDir: string
  private readonly indexPath: string
  private readonly messages
  private initialized = false

  constructor(
    private readonly baseDir: string,
    private readonly locale: AppLocale,
    private readonly noteLinkStore?: NoteLinkStore,
    private readonly assetStore?: AssetStore,
    private readonly versionStore?: VersionStore,
  ) {
    this.notesDir = path.join(baseDir, "items")
    this.indexPath = path.join(baseDir, "index.json")
    this.messages = getMessages(locale)
  }

  async ensureReady() {
    if (this.initialized) {
      return
    }

    await mkdir(this.notesDir, { recursive: true })
    await this.noteLinkStore?.ensureReady()
    await this.assetStore?.ensureReady()
    await this.versionStore?.ensureReady()

    try {
      await stat(this.indexPath)
    } catch {
      await this.writeIndex([])
    }

    const notes = await this.readIndex()

    if (notes.length === 0) {
      await this.createWelcomeNote()
    }

    await this.syncLinkIndex()

    this.initialized = true
  }

  async list() {
    await this.ensureReady()

    return this.readIndex()
  }

  async get(id: string): Promise<NoteDocument | null> {
    await this.ensureReady()

    const notes = await this.readIndex()
    const summary = notes.find((note) => note.id === id)

    if (!summary) {
      return null
    }

    const content = await this.readContent(summary.id)

    return {
      ...summary,
      content,
    }
  }

  async create(seed: CreateNoteInput = {}) {
    await this.ensureReady()

    const notes = await this.readIndex()
    const now = new Date().toISOString()
    const id = randomUUID()
    const plainText = seed.plainText?.trim() ?? ""
    const workspace = seed.workspace ?? "personal"
    const note: NoteDocument = {
      id,
      parentId: this.resolveParentId(notes, id, seed.parentId ?? null),
      title: normalizeTitle(seed.title, this.locale),
      preview: buildPreview(plainText, this.locale),
      plainText,
      createdAt: now,
      updatedAt: now,
      wordCount: countWords(plainText),
      isPinned: seed.isPinned ?? false,
      status: "active",
      tags: normalizeTags(seed.tags ?? []),
      workspace,
      workspaceName: normalizeWorkspaceName(workspace, seed.workspaceName, this.locale),
      visibility: seed.visibility ?? (workspace === "team" ? "public" : "private"),
      content: seed.content ?? createEmptyDocument(),
    }

    await this.writeContent(note.id, note.content)
    await this.writeIndex([this.toSummary(note), ...notes])
    await this.noteLinkStore?.updateOutgoing(note.id, extractNoteLinkIds(note.content))

    return note
  }

  async update(id: string, payload: UpdateNoteInput) {
    await this.ensureReady()

    const current = await this.get(id)

    if (!current) {
      throw new Error(this.messages.errors.noteNotFound(id))
    }

    const notes = await this.readIndex()
    const nextContent = payload.content ?? current.content
    const plainText = payload.plainText ?? current.plainText
    const updatedAt = new Date().toISOString()
    const nextStatus: NoteStatus = payload.status ?? current.status
    const nextTags = payload.tags ? normalizeTags(payload.tags) : current.tags
    const nextIsPinned = nextStatus === "trashed" ? false : payload.isPinned ?? current.isPinned
    const nextWorkspace: NoteWorkspace = payload.workspace ?? current.workspace
    const nextVisibility: NoteVisibility = payload.visibility ?? current.visibility
    const hasParentId = Object.prototype.hasOwnProperty.call(payload, "parentId")
    const nextParentId = this.resolveParentId(notes, id, hasParentId ? payload.parentId ?? null : current.parentId)

    const next: NoteDocument = {
      ...current,
      parentId: nextParentId,
      title: normalizeTitle(payload.title ?? current.title, this.locale),
      preview: buildPreview(plainText, this.locale),
      plainText,
      wordCount: countWords(plainText),
      updatedAt,
      isPinned: nextIsPinned,
      status: nextStatus,
      tags: nextTags,
      workspace: nextWorkspace,
      workspaceName: normalizeWorkspaceName(nextWorkspace, payload.workspaceName ?? current.workspaceName, this.locale),
      visibility: nextVisibility,
      content: nextContent,
    }
    const contentChanged = JSON.stringify(current.content) !== JSON.stringify(nextContent)

    const nextNotes = notes.map((note) => (note.id === id ? this.toSummary(next) : note))

    await this.writeContent(id, nextContent)
    await this.writeIndex(nextNotes)
    await this.noteLinkStore?.updateOutgoing(id, extractNoteLinkIds(nextContent))

    if (Object.prototype.hasOwnProperty.call(payload, "content")) {
      await this.assetStore?.cleanupUnreferenced(id, nextContent)
    }

    if (contentChanged && next.status === "active") {
      await this.versionStore?.maybeCreateSnapshot(next)
    }

    return next
  }

  async moveToTrash(id: string) {
    await this.ensureReady()

    const notes = await this.readIndex()
    const targetIds = this.collectDescendantIds(notes, id)
    const updatedAt = new Date().toISOString()
    const nextNotes = notes.map((note) =>
      targetIds.has(note.id)
        ? {
            ...note,
            status: "trashed" as const,
            isPinned: false,
            updatedAt,
          }
        : note,
    )

    await this.writeIndex(nextNotes)

    const trashed = await this.get(id)

    await this.ensureActiveWorkspace()

    if (!trashed) {
      throw new Error(this.messages.errors.noteNotFound(id))
    }

    return trashed
  }

  async restore(id: string) {
    await this.ensureReady()

    const notes = await this.readIndex()
    const restoredIds = new Set([
      ...this.collectDescendantIds(notes, id),
      ...this.collectAncestorIds(notes, id),
    ])
    const updatedAt = new Date().toISOString()
    const nextNotes = notes.map((note) =>
      restoredIds.has(note.id)
        ? {
            ...note,
            status: "active" as const,
            updatedAt,
          }
        : note,
    )

    await this.writeIndex(nextNotes)

    const restored = await this.get(id)

    if (!restored) {
      throw new Error(this.messages.errors.noteNotFound(id))
    }

    return restored
  }

  async duplicate(id: string) {
    const current = await this.get(id)

    if (!current) {
      throw new Error(this.messages.errors.noteNotFound(id))
    }

    const duplicated = await this.create({
      parentId: current.parentId,
      title: this.messages.notes.duplicateTitle(current.title),
      content: current.content,
      plainText: current.plainText,
      tags: current.tags,
      workspace: current.workspace,
      workspaceName: current.workspaceName,
      visibility: current.visibility,
    })

    if (!this.assetStore) {
      return duplicated
    }

    const duplicatedContent = await this.assetStore.cloneReferencedAssets(current.content, duplicated.id)

    if (duplicatedContent === current.content) {
      return duplicated
    }

    return this.update(duplicated.id, {
      content: duplicatedContent,
      plainText: duplicated.plainText,
    })
  }

  async deleteForever(id: string): Promise<DeleteNoteResult> {
    await this.ensureReady()

    const notes = await this.readIndex()
    const deletedIds = this.collectDescendantIds(notes, id)
    const remaining = notes.filter((note) => !deletedIds.has(note.id))

    await Promise.all([...deletedIds].map((noteId) => rm(this.filePath(noteId), { force: true })))
    await this.writeIndex(remaining)
    await Promise.all([...deletedIds].map((noteId) => this.noteLinkStore?.removeOutgoing(noteId)))
    await Promise.all([...deletedIds].map((noteId) => this.assetStore?.deleteNoteAssets(noteId)))
    await Promise.all([...deletedIds].map((noteId) => this.versionStore?.deleteNoteVersions(noteId)))

    const fallback = await this.ensureActiveWorkspace()
    const nextNotes = await this.readIndex()
    const nextActive = nextNotes.find((note) => note.status === "active")

    return {
      deletedId: id,
      nextNoteId: fallback?.id ?? nextActive?.id ?? nextNotes[0]?.id ?? null,
    }
  }

  private async ensureActiveWorkspace() {
    const notes = await this.readIndex()
    const hasActiveNote = notes.some((note) => note.status === "active")

    if (hasActiveNote) {
      return null
    }

    return this.create()
  }

  private async syncLinkIndex() {
    if (!this.noteLinkStore) {
      return
    }

    const notes = await this.readIndex()
    const outgoing = Object.fromEntries(
      (
        await Promise.all(
          notes.map(async (note) => {
            const content = await this.readContent(note.id)
            const targetIds = extractNoteLinkIds(content)

            return targetIds.length > 0 ? ([note.id, targetIds] as const) : null
          }),
        )
      ).filter((entry): entry is readonly [string, string[]] => Boolean(entry)),
    )

    await this.noteLinkStore.replaceAllOutgoing(outgoing)
  }

  private async createWelcomeNote() {
    const now = new Date().toISOString()
    const content = createWelcomeDocument(this.locale)
    const seeds = this.messages.notes.seeds
    const workspaceName = this.messages.notes.workspacePersonal
    const plainText = seeds.welcomePlainText

    const welcomeNote: NoteDocument = {
      id: randomUUID(),
      parentId: null,
      title: seeds.welcomeTitle,
      preview: buildPreview(plainText, this.locale),
      plainText,
      createdAt: now,
      updatedAt: now,
      wordCount: countWords(plainText),
      isPinned: true,
      status: "active",
      tags: seeds.welcomeTags,
      workspace: "personal",
      workspaceName,
      visibility: "private",
      content,
    }

    const roadmapPlainText = seeds.roadmapPlainText
    const roadmapNote: NoteDocument = {
      id: randomUUID(),
      parentId: welcomeNote.id,
      title: seeds.roadmapTitle,
      preview: buildPreview(roadmapPlainText, this.locale),
      plainText: roadmapPlainText,
      createdAt: now,
      updatedAt: now,
      wordCount: countWords(roadmapPlainText),
      isPinned: false,
      status: "active",
      tags: seeds.roadmapTags,
      workspace: "personal",
      workspaceName,
      visibility: "private",
      content: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: {
              level: 1,
            },
            content: [
              {
                type: "text",
                text: seeds.roadmapTitle,
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: seeds.roadmapBody,
              },
            ],
          },
        ],
      },
    }

    const planningPlainText = seeds.planningPlainText
    const planningNote: NoteDocument = {
      id: randomUUID(),
      parentId: roadmapNote.id,
      title: seeds.planningTitle,
      preview: buildPreview(planningPlainText, this.locale),
      plainText: planningPlainText,
      createdAt: now,
      updatedAt: now,
      wordCount: countWords(planningPlainText),
      isPinned: false,
      status: "active",
      tags: seeds.planningTags,
      workspace: "personal",
      workspaceName,
      visibility: "private",
      content: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: {
              level: 1,
            },
            content: [
              {
                type: "text",
                text: seeds.planningTitle,
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: seeds.planningBody,
              },
            ],
          },
        ],
      },
    }

    await this.writeContent(welcomeNote.id, welcomeNote.content)
    await this.writeContent(roadmapNote.id, roadmapNote.content)
    await this.writeContent(planningNote.id, planningNote.content)
    await this.writeIndex([this.toSummary(welcomeNote), this.toSummary(roadmapNote), this.toSummary(planningNote)])
  }

  private async readContent(id: string): Promise<JSONContent> {
    const content = await readFile(this.filePath(id), "utf-8")

    return JSON.parse(content) as JSONContent
  }

  private async writeContent(id: string, content: JSONContent) {
    await writeFile(this.filePath(id), JSON.stringify(content, null, 2), "utf-8")
  }

  private normalizeSummary(note: StoredSummary) {
    const createdAt = note.createdAt || new Date().toISOString()
    const updatedAt = note.updatedAt || createdAt
    const plainText = note.plainText?.trim() ?? note.preview?.trim() ?? ""
    const workspace = note.workspace ?? "personal"
    const parentId = typeof note.parentId === "string" && note.parentId.trim() ? note.parentId : null

    return {
      id: note.id || randomUUID(),
      parentId,
      title: normalizeTitle(note.title, this.locale),
      preview: buildPreview(plainText, this.locale),
      plainText,
      createdAt,
      updatedAt,
      wordCount: note.wordCount ?? countWords(plainText),
      isPinned: note.isPinned ?? false,
      status: note.status ?? "active",
      tags: normalizeTags(note.tags ?? []),
      workspace,
      workspaceName: normalizeWorkspaceName(workspace, note.workspaceName, this.locale),
      visibility: note.visibility ?? (workspace === "team" ? "public" : "private"),
    } satisfies NoteSummary
  }

  private async readIndex() {
    const raw = await readFile(this.indexPath, "utf-8")
    const payload = JSON.parse(raw) as { version?: number; notes?: StoredSummary[] }
    const normalized = (payload.notes ?? []).map((note) => this.normalizeSummary(note))
    const sanitized = this.sanitizeHierarchy(normalized)

    if (payload.version !== 4 || this.hasHierarchyChanges(normalized, sanitized)) {
      await this.writeIndex(sanitized)
    }

    return this.sortNotes(sanitized)
  }

  private async writeIndex(notes: NoteSummary[]) {
    const payload: NoteIndexPayload = {
      version: 4,
      notes: this.sortNotes(notes),
    }

    await writeFile(this.indexPath, JSON.stringify(payload, null, 2), "utf-8")
  }

  private filePath(id: string) {
    return path.join(this.notesDir, `${id}.json`)
  }

  private toSummary(note: NoteDocument): NoteSummary {
    return {
      id: note.id,
      parentId: note.parentId,
      title: note.title,
      preview: note.preview,
      plainText: note.plainText,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      wordCount: note.wordCount,
      isPinned: note.isPinned,
      status: note.status,
      tags: note.tags,
      workspace: note.workspace,
      workspaceName: note.workspaceName,
      visibility: note.visibility,
    }
  }

  private sortNotes(notes: NoteSummary[]) {
    return [...notes].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
  }

  private sanitizeHierarchy(notes: NoteSummary[]) {
    return notes.map((note) => ({
      ...note,
      parentId: this.resolveParentId(notes, note.id, note.parentId),
    }))
  }

  private hasHierarchyChanges(current: NoteSummary[], next: NoteSummary[]) {
    return current.some((note, index) => note.parentId !== next[index]?.parentId)
  }

  private resolveParentId(notes: NoteSummary[], noteId: string, parentId: string | null) {
    if (!parentId || parentId === noteId) {
      return null
    }

    const byId = new Map(notes.map((note) => [note.id, note]))

    if (!byId.has(parentId)) {
      return null
    }

    const visited = new Set<string>([noteId])
    let currentId: string | null = parentId

    while (currentId) {
      if (visited.has(currentId)) {
        return null
      }

      visited.add(currentId)

      const nextParentId: string | null = byId.get(currentId)?.parentId ?? null

      if (!nextParentId || !byId.has(nextParentId)) {
        return parentId
      }

      currentId = nextParentId
    }

    return parentId
  }

  private collectDescendantIds(notes: NoteSummary[], rootId: string) {
    const childrenByParent = new Map<string, string[]>()

    for (const note of notes) {
      if (!note.parentId) {
        continue
      }

      const siblings = childrenByParent.get(note.parentId) ?? []
      siblings.push(note.id)
      childrenByParent.set(note.parentId, siblings)
    }

    const visited = new Set<string>()
    const stack = [rootId]

    while (stack.length > 0) {
      const currentId = stack.pop()

      if (!currentId || visited.has(currentId)) {
        continue
      }

      visited.add(currentId)

      for (const childId of childrenByParent.get(currentId) ?? []) {
        stack.push(childId)
      }
    }

    return visited
  }

  private collectAncestorIds(notes: NoteSummary[], noteId: string) {
    const byId = new Map(notes.map((note) => [note.id, note]))
    const ancestors = new Set<string>()
    let currentId = byId.get(noteId)?.parentId ?? null

    while (currentId && byId.has(currentId) && !ancestors.has(currentId)) {
      ancestors.add(currentId)
      currentId = byId.get(currentId)?.parentId ?? null
    }

    return ancestors
  }
}
