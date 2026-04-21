import { AlertTriangle, Check, Cloud, CloudOff, Loader2, Settings2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ConflictDialog } from "@/components/conflict-dialog"
import { NoteEditor } from "@/components/note-editor"
import { NoteList } from "@/components/note-list"
import { NoteSidebar } from "@/components/note-sidebar"
import { SettingsPage } from "@/components/settings-page"
import { TemplateDialog, type TemplateDialogValues } from "@/components/template-dialog"
import { useI18n } from "@/i18n/provider"
import { cn } from "@/lib/utils"
import {
  buildPreview,
  countWords,
  type CreateNoteInput,
  type NoteDocument,
  type NoteSummary,
  type NoteView,
} from "@/shared/notes"
import type { NoteSyncStateMap, SyncResult, SyncStatus } from "@/shared/sync"

function noteSnapshot(note: NoteDocument | null) {
  if (!note) {
    return null
  }

  return JSON.stringify({
    parentId: note.parentId,
    title: note.title,
    content: note.content,
    isPinned: note.isPinned,
    status: note.status,
    tags: note.tags,
    workspace: note.workspace,
    workspaceName: note.workspaceName,
    visibility: note.visibility,
  })
}

function upsertSummary(list: NoteSummary[], note: NoteSummary) {
  const existingIndex = list.findIndex((item) => item.id === note.id)

  if (existingIndex === -1) {
    return [note, ...list]
  }

  return list.map((item) => (item.id === note.id ? note : item))
}

function replaceSummary(list: NoteSummary[], note: NoteSummary) {
  return list.map((item) => (item.id === note.id ? note : item))
}

function toSummary(note: NoteDocument): NoteSummary {
  const { content: _content, ...summary } = note
  return summary
}

function matchesSearch(note: NoteSummary, keyword: string) {
  return [note.title, note.preview, note.plainText].join(" ").toLowerCase().includes(keyword)
}

function filterNotes(notes: NoteSummary[], view: NoteView, searchValue: string) {
  const keyword = searchValue.trim().toLowerCase()
  let filtered = notes.filter((note) => {
    if (view === "trash") {
      return note.status === "trashed"
    }

    return note.status === "active"
  })

  if (view === "favorites") {
    filtered = filtered.filter((note) => note.isFavorite)
  }

  if (keyword) {
    filtered = filtered.filter((note) => matchesSearch(note, keyword))
  }

  return filtered
}

function pickVisibleNoteId(notes: NoteSummary[], preferredId: string | null, view: NoteView, searchValue: string) {
  const visible = filterNotes(notes, view, searchValue)

  if (preferredId && visible.some((note) => note.id === preferredId)) {
    return preferredId
  }

  return visible[0]?.id ?? null
}

function countsFor(notes: NoteSummary[]) {
  return {
    all: notes.filter((note) => note.status === "active").length,
    favorites: notes.filter((note) => note.status === "active" && note.isFavorite).length,
    trash: notes.filter((note) => note.status === "trashed").length,
  } satisfies Record<NoteView, number>
}

function createPayloadForSelection(note: Pick<NoteSummary, "id" | "status" | "workspace" | "workspaceName" | "visibility"> | null): CreateNoteInput {
  if (note && note.status === "active") {
    return {
      parentId: note.id,
      workspace: note.workspace,
      workspaceName: note.workspaceName,
      visibility: note.visibility,
    }
  }

  return {
    parentId: null,
    workspace: "personal",
    visibility: "private",
  }
}

function resolveViewForNote(note: Pick<NoteSummary, "isPinned" | "status">, preferredView: NoteView): NoteView {
  if (note.status === "trashed") {
    return "trash"
  }

  if (preferredView === "favorites" && note.isPinned) {
    return "favorites"
  }

  return "all"
}

type EditorOpenMode = "preview" | "edit"
type AppScreen = "notes" | "settings"

export default function App() {
  const { locale, messages } = useI18n()
  const [allNotes, setAllNotes] = useState<NoteSummary[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [draftNote, setDraftNote] = useState<NoteDocument | null>(null)
  const [editorOpenRequest, setEditorOpenRequest] = useState<{ mode: EditorOpenMode; id: number }>({
    mode: "preview",
    id: 0,
  })
  const [activeScreen, setActiveScreen] = useState<AppScreen>("notes")
  const [searchValue, setSearchValue] = useState("")
  const [activeView, setActiveView] = useState<NoteView>("all")
  const [isBooting, setIsBooting] = useState(true)
  const [isLoadingNote, setIsLoadingNote] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null)
  const [noteSyncStates, setNoteSyncStates] = useState<NoteSyncStateMap>({})
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: "not-configured" })
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null)
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false)
  const [isSaveTemplateDialogOpen, setIsSaveTemplateDialogOpen] = useState(false)
  const [isSubmittingTemplateAction, setIsSubmittingTemplateAction] = useState(false)
  const [templateActionError, setTemplateActionError] = useState<string | null>(null)
  const [isFocusMode, setIsFocusMode] = useState(false)
  const selectedIdRef = useRef<string | null>(null)
  const draftRef = useRef<NoteDocument | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const pendingSaveRef = useRef<Promise<NoteDocument | null> | null>(null)
  const lastPersistedSnapshotRef = useRef<string | null>(null)
  const noteSyncStatesRequestIdRef = useRef(0)
  const plainTextRef = useRef("")
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchValueRef = useRef("")
  const activeViewRef = useRef<NoteView>("all")
  const [draftOverrides, setDraftOverrides] = useState<Record<string, NoteDocument>>({})
  const draftOverridesRef = useRef<Record<string, NoteDocument>>({})

  const notesWithDraftOverrides = useMemo(
    () =>
      allNotes.map((note) => {
        const draft = draftOverrides[note.id]
        return draft ? toSummary(draft) : note
      }),
    [allNotes, draftOverrides],
  )

  const visibleNotes = filterNotes(notesWithDraftOverrides, activeView, searchValue)
  const counts = countsFor(notesWithDraftOverrides)
  const requestEditorOpenMode = useCallback((mode: EditorOpenMode) => {
    setEditorOpenRequest((current) => ({
      mode,
      id: current.id + 1,
    }))
  }, [])

  const hasPendingDraftChanges = useCallback((note: NoteDocument | null = draftRef.current) => {
    const snapshot = noteSnapshot(note)

    return Boolean(snapshot && snapshot !== lastPersistedSnapshotRef.current)
  }, [])

  const syncDraftOverride = useCallback((note: NoteDocument | null, persistedSnapshot: string | null = lastPersistedSnapshotRef.current) => {
    if (!note) {
      return
    }

    const nextSnapshot = noteSnapshot(note)

    setDraftOverrides((current) => {
      const next = { ...current }

      if (!nextSnapshot || nextSnapshot === persistedSnapshot) {
        delete next[note.id]
      } else {
        next[note.id] = note
      }

      draftOverridesRef.current = next
      return next
    })
  }, [])

  const clearDraftOverride = useCallback((noteId: string) => {
    setDraftOverrides((current) => {
      if (!current[noteId]) {
        return current
      }

      const next = { ...current }
      delete next[noteId]
      draftOverridesRef.current = next
      return next
    })
  }, [])

  const refreshNoteSyncStates = useCallback(async () => {
    const requestId = noteSyncStatesRequestIdRef.current + 1
    noteSyncStatesRequestIdRef.current = requestId

    try {
      const nextStates = await window.metisNote.sync.getNoteSyncStates()

      if (noteSyncStatesRequestIdRef.current !== requestId) {
        return
      }

      setNoteSyncStates(nextStates)
    } catch {
      // Sync may not be configured yet.
    }
  }, [])

  const refreshSelectedDraftFromDisk = useCallback(async () => {
    const selectedId = selectedIdRef.current

    if (!selectedId || hasPendingDraftChanges()) {
      return
    }

    const note = await window.metisNote.notes.get(selectedId)

    if (selectedIdRef.current !== selectedId) {
      return
    }

    lastPersistedSnapshotRef.current = noteSnapshot(note)
    plainTextRef.current = note?.plainText ?? ""
    draftRef.current = note
    setDraftNote(note)
    setLastSavedAt(note?.updatedAt ?? null)
  }, [hasPendingDraftChanges])

  async function ensureEditorPreviewMode() {
    requestEditorOpenMode("preview")
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0)
    })
  }

  useEffect(() => {
    selectedIdRef.current = selectedNoteId
  }, [selectedNoteId])

  useEffect(() => {
    draftRef.current = draftNote
  }, [draftNote])

  useEffect(() => {
    searchValueRef.current = searchValue
  }, [searchValue])

  useEffect(() => {
    activeViewRef.current = activeView
  }, [activeView])

  useEffect(() => {
    let active = true

    void (async () => {
      try {
        const nextNotes = await window.metisNote.notes.list()

        if (!active) {
          return
        }

        setAllNotes(nextNotes)
        void refreshNoteSyncStates()

        const nextSelectedId = pickVisibleNoteId(nextNotes, null, activeViewRef.current, searchValueRef.current)
        selectedIdRef.current = nextSelectedId
        setSelectedNoteId(nextSelectedId)
        requestEditorOpenMode("preview")
        setErrorMessage(null)
      } catch (error) {
        if (!active) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : messages.errors.loadNoteListFailed)
      } finally {
        if (active) {
          setIsBooting(false)
        }
      }
    })()

    return () => {
      active = false
    }
  }, [messages.errors.loadNoteListFailed])

  useEffect(() => {
    const nextSelectedId = pickVisibleNoteId(allNotes, selectedIdRef.current, activeView, searchValue)

    if (nextSelectedId !== selectedIdRef.current) {
      selectedIdRef.current = nextSelectedId
      setSelectedNoteId(nextSelectedId)
      requestEditorOpenMode("preview")
    }
  }, [allNotes, activeView, searchValue])

  useEffect(() => {
    if (!selectedNoteId) {
      setDraftNote(null)
      setIsLoadingNote(false)
      setLastSavedAt(null)
      return
    }

    let active = true
    setIsLoadingNote(true)

    void (async () => {
      try {
        const note = await window.metisNote.notes.get(selectedNoteId)

        if (!active) {
          return
        }

        lastPersistedSnapshotRef.current = noteSnapshot(note)
        const draftOverride = draftOverridesRef.current[selectedNoteId] ?? null
        const nextDraft = draftOverride ?? note

        plainTextRef.current = nextDraft?.plainText ?? note?.plainText ?? ""
        draftRef.current = nextDraft
        setDraftNote(nextDraft)

        setLastSavedAt(note?.updatedAt ?? null)
        setErrorMessage(null)
      } catch (error) {
        if (!active) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : messages.errors.readNoteFailed)
      } finally {
        if (active) {
          setIsLoadingNote(false)
        }
      }
    })()

    return () => {
      active = false
    }
  }, [messages.errors.readNoteFailed, selectedNoteId])

  useEffect(() => {
    if (!noticeMessage) {
      return
    }

    const timer = window.setTimeout(() => {
      setNoticeMessage(null)
    }, 3200)

    return () => {
      window.clearTimeout(timer)
    }
  }, [noticeMessage])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isFocusMode) {
        setIsFocusMode(false)
        return
      }

      if (!event.metaKey && !event.ctrlKey) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === "f" && event.shiftKey) {
        if (activeScreen === "notes" && selectedIdRef.current) {
          event.preventDefault()
          setIsFocusMode((current) => !current)
        }

        return
      }

      if (key === "n") {
        event.preventDefault()
        void handleCreateNote()
      }

      if (key === "f") {
        event.preventDefault()
        searchInputRef.current?.focus()
      }

      if (key === "s") {
        event.preventDefault()
        void handleManualCommitEdits()
      }

      if (key === "p" && activeScreen === "notes" && selectedIdRef.current) {
        event.preventDefault()
        void handleExportPdf()
      }
    }

    const handleBeforeUnload = () => {
      void flushPendingSave()
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  })

  const refreshNotes = useCallback(async (
    preferredId?: string | null,
    preferredMode?: EditorOpenMode,
    options?: { reloadSelectedFromDisk?: boolean },
  ) => {
    const nextNotes = await window.metisNote.notes.list()
    const previousSelectedId = selectedIdRef.current

    setAllNotes(nextNotes)

    const nextSelectedId = pickVisibleNoteId(
      nextNotes,
      preferredId ?? selectedIdRef.current,
      activeViewRef.current,
      searchValueRef.current,
    )
    selectedIdRef.current = nextSelectedId
    setSelectedNoteId(nextSelectedId)

    if (preferredMode) {
      requestEditorOpenMode(preferredMode)
    } else if (nextSelectedId !== previousSelectedId) {
      requestEditorOpenMode("preview")
    }

    if (options?.reloadSelectedFromDisk) {
      await refreshSelectedDraftFromDisk()
    }

    await refreshNoteSyncStates()

    return {
      notes: nextNotes,
      selectedId: nextSelectedId,
    }
  }, [refreshNoteSyncStates, refreshSelectedDraftFromDisk, requestEditorOpenMode])

  function cancelScheduledSave() {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }

  const handleManualCommitEdits = useCallback(async () => {
    const current = draftRef.current

    if (!current || current.status !== "active") {
      return
    }

    const shouldSave = hasPendingDraftChanges(current)
    let saved = current

    if (shouldSave) {
      cancelScheduledSave()
      pendingSaveRef.current = persistNote(current, plainTextRef.current).finally(() => {
        pendingSaveRef.current = null
      })

      const result = await pendingSaveRef.current

      if (!result) {
        return
      }

      saved = result
    }

    if (syncStatus.state === "disabled" || syncStatus.state === "not-configured") {
      return
    }

    if (!shouldSave && noteSyncStates[saved.id] !== "upload-pending") {
      return
    }

    setNoteSyncStates((currentStates) =>
      currentStates[saved.id] === "conflict"
        ? currentStates
        : {
            ...currentStates,
            [saved.id]: "upload-pending",
          },
    )

    try {
      const result = await window.metisNote.sync.syncNow()

      if (result.status === "success" && result.pulled > 0) {
        await refreshNotes(selectedIdRef.current, undefined, { reloadSelectedFromDisk: true })
        return
      }

      await refreshNoteSyncStates()
    } catch {
      // Keep save success separate from background sync failures.
    }
  }, [cancelScheduledSave, hasPendingDraftChanges, noteSyncStates, refreshNoteSyncStates, refreshNotes, syncStatus.state])

  async function persistNote(note: NoteDocument, plainText: string) {
    const snapshot = noteSnapshot(note)

    if (!snapshot || snapshot === lastPersistedSnapshotRef.current) {
      return null
    }

    setIsSaving(true)

    try {
      const saved = await window.metisNote.notes.update(note.id, {
        parentId: note.parentId,
        title: note.title,
        content: note.content,
        plainText,
        isPinned: note.isPinned,
        status: note.status,
        tags: note.tags,
        workspace: note.workspace,
        workspaceName: note.workspaceName,
        visibility: note.visibility,
      })

      lastPersistedSnapshotRef.current = noteSnapshot(saved)
      plainTextRef.current = saved.plainText
      setLastSavedAt(saved.updatedAt)
      setErrorMessage(null)
      setDraftNote((current) => {
        if (!current || current.id !== saved.id) {
          return current
        }

        // Preserve the existing content reference to avoid triggering a
        // ProseMirror setContent call when the content hasn't actually changed.
        const contentUnchanged = JSON.stringify(current.content) === JSON.stringify(saved.content)

        const merged = {
          ...saved,
          content: contentUnchanged ? current.content : saved.content,
        }

        draftRef.current = merged
        return merged
      })
      setAllNotes((current) => upsertSummary(current, saved))
      clearDraftOverride(saved.id)
      return saved
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : messages.errors.saveFailed)
      return null
    } finally {
      setIsSaving(false)
    }
  }

  async function flushPendingSave() {
    cancelScheduledSave()

    if (pendingSaveRef.current) {
      await pendingSaveRef.current
    }
  }

  function getSelectedActiveSummary() {
    if (activeViewRef.current === "trash") {
      return null
    }

    return notesWithDraftOverrides.find((note) => note.id === selectedIdRef.current && note.status === "active") ?? null
  }

  async function handleSelectNote(id: string, mode: EditorOpenMode) {
    if (id === selectedIdRef.current) {
      requestEditorOpenMode(mode)
      return
    }

    await flushPendingSave()
    selectedIdRef.current = id
    setSelectedNoteId(id)
    requestEditorOpenMode(mode)
  }

  async function handleDeselectNote() {
    if (selectedIdRef.current === null) {
      return
    }

    await flushPendingSave()
    selectedIdRef.current = null
    setSelectedNoteId(null)
  }

  function handleOpenLinkedNote(id: string) {
    setActiveScreen("notes")
    void handleSelectNote(id, "preview")
  }

  async function handleCreateNote() {
    try {
      await flushPendingSave()
      const selectedSummary = getSelectedActiveSummary()
      const payload = createPayloadForSelection(selectedSummary)
      const created = await window.metisNote.notes.create(payload)
      const nextView = resolveViewForNote(created, activeViewRef.current)

      activeViewRef.current = nextView
      setActiveView(nextView)
      setDraftNote(created)
      requestEditorOpenMode("preview")
      lastPersistedSnapshotRef.current = noteSnapshot(created)
      plainTextRef.current = created.plainText
      setLastSavedAt(created.updatedAt)
      await refreshNotes(created.id)
      setNoticeMessage(selectedSummary ? messages.notices.createdChild(selectedSummary.title) : messages.notices.created)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : messages.errors.createFailed)
    }
  }

  async function handleOpenSaveTemplateDialog() {
    if (!draftNote || draftNote.status !== "active") {
      return
    }

    await flushPendingSave()
    setTemplateActionError(null)
    setIsSaveTemplateDialogOpen(true)
  }

  async function handleSaveTemplate(values: TemplateDialogValues) {
    if (!draftRef.current || draftRef.current.status !== "active") {
      return
    }

    setIsSubmittingTemplateAction(true)
    setTemplateActionError(null)

    try {
      const template = await window.metisNote.templates.createFromNote(draftRef.current.id, {
        title: values.title,
        description: values.description,
        category: values.category,
      })
      setIsSaveTemplateDialogOpen(false)
      setNoticeMessage(messages.notices.templateSaved(template.title))
    } catch (error) {
      setTemplateActionError(error instanceof Error ? error.message : messages.settings.templates.errors.createFailed)
    } finally {
      setIsSubmittingTemplateAction(false)
    }
  }

  async function handleRestoreVersion(timestamp: string) {
    if (!draftRef.current) {
      return
    }

    try {
      await flushPendingSave()
      const restored = await window.metisNote.versions.restore(draftRef.current.id, timestamp)
      const nextView = resolveViewForNote(restored, activeViewRef.current)

      activeViewRef.current = nextView
      setActiveView(nextView)
      clearDraftOverride(restored.id)
      setDraftNote(restored)
      requestEditorOpenMode("preview")
      setLastSavedAt(restored.updatedAt)
      lastPersistedSnapshotRef.current = noteSnapshot(restored)
      plainTextRef.current = restored.plainText
      await refreshNotes(restored.id)
      setNoticeMessage(messages.notices.versionRestored(restored.title))
      setErrorMessage(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : messages.errors.restoreVersionFailed
      setErrorMessage(message)
      throw error instanceof Error ? error : new Error(message)
    }
  }

  async function handleImportNote() {
    try {
      await flushPendingSave()
      const selectedSummary = getSelectedActiveSummary()
      const result = await window.metisNote.notes.importMarkdown(createPayloadForSelection(selectedSummary))

      if (!result.note) {
        return
      }

      const nextView = resolveViewForNote(result.note, activeViewRef.current)
      activeViewRef.current = nextView
      setActiveView(nextView)
      setDraftNote(result.note)
      requestEditorOpenMode("preview")
      setLastSavedAt(result.note.updatedAt)
      lastPersistedSnapshotRef.current = noteSnapshot(result.note)
      plainTextRef.current = result.note.plainText
      let refreshResult = await refreshNotes(result.note.id, "preview")

      if (refreshResult.selectedId !== result.note.id && searchValueRef.current.trim()) {
        searchValueRef.current = ""
        setSearchValue("")
        refreshResult = await refreshNotes(result.note.id, "preview")
      }

      if (refreshResult.selectedId !== result.note.id && refreshResult.notes.some((note) => note.id === result.note?.id)) {
        selectedIdRef.current = result.note.id
        setSelectedNoteId(result.note.id)
        requestEditorOpenMode("preview")
      }

      setNoticeMessage(messages.notices.imported(result.note.title))
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : messages.errors.importFailed)
    }
  }

  async function handleExportNote() {
    if (!draftNote) {
      return
    }

    try {
      await flushPendingSave()
      const result = await window.metisNote.notes.exportMarkdown(draftNote.id)

      if (result.filePath) {
        setNoticeMessage(messages.notices.exported(result.filePath))
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : messages.errors.exportFailed)
    }
  }

  async function handleExportPdf() {
    if (!draftRef.current) {
      return
    }

    try {
      await flushPendingSave()
      await ensureEditorPreviewMode()
      const result = await window.metisNote.notes.exportPdf(draftRef.current.id)

      if (result.filePath) {
        setNoticeMessage(messages.notices.exportedPdf(result.filePath))
        setErrorMessage(null)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : messages.errors.exportPdfFailed)
    }
  }

  async function handlePrintNote() {
    if (!draftRef.current) {
      return
    }

    try {
      await flushPendingSave()
      await ensureEditorPreviewMode()
      await window.metisNote.notes.print(draftRef.current.id)
      setNoticeMessage(messages.notices.printStarted)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : messages.errors.printFailed)
    }
  }

  async function handleDuplicateNote() {
    if (!draftNote) {
      return
    }

    try {
      await flushPendingSave()
      const duplicated = await window.metisNote.notes.duplicate(draftNote.id)
      const nextView = resolveViewForNote(duplicated, activeViewRef.current)

      activeViewRef.current = nextView
      setActiveView(nextView)
      setDraftNote(duplicated)
      requestEditorOpenMode("preview")
      setLastSavedAt(duplicated.updatedAt)
      lastPersistedSnapshotRef.current = noteSnapshot(duplicated)
      plainTextRef.current = duplicated.plainText
      await refreshNotes(duplicated.id)
      setNoticeMessage(messages.notices.duplicated(duplicated.title))
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : messages.errors.duplicateFailed)
    }
  }

  async function handleMoveToTrash(id: string) {
    const target = allNotes.find((note) => note.id === id)
    const title = target?.title || messages.notes.emptyTitle

    if (!window.confirm(messages.dialogs.confirmMoveToTrash(title))) {
      return
    }

    try {
      await flushPendingSave()
      await window.metisNote.notes.trash(id)
      clearDraftOverride(id)
      await refreshNotes(selectedIdRef.current === id ? null : selectedIdRef.current, selectedIdRef.current === id ? "preview" : undefined)
      setNoticeMessage(messages.notices.movedToTrash(title))
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : messages.errors.moveToTrashFailed)
    }
  }

  async function handleRestoreNote(id: string) {
    try {
      await flushPendingSave()
      const restored = await window.metisNote.notes.restore(id)
      const nextView = resolveViewForNote(restored, activeViewRef.current)

      activeViewRef.current = nextView
      setActiveView(nextView)
      setDraftNote(restored)
      requestEditorOpenMode("preview")
      setLastSavedAt(restored.updatedAt)
      lastPersistedSnapshotRef.current = noteSnapshot(restored)
      plainTextRef.current = restored.plainText
      await refreshNotes(restored.id)
      setNoticeMessage(messages.notices.restored(restored.title))
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : messages.errors.restoreFailed)
    }
  }

  async function handleDeleteForever(id: string) {
    const target = allNotes.find((note) => note.id === id)
    const title = target?.title || messages.notes.emptyTitle

    if (!window.confirm(messages.dialogs.confirmDeleteForever(title))) {
      return
    }

    try {
      await flushPendingSave()
      const result = await window.metisNote.notes.deleteForever(id)
      clearDraftOverride(id)
      await refreshNotes(result.nextNoteId, "preview")
      setNoticeMessage(messages.notices.deletedForever(title))
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : messages.errors.deleteForeverFailed)
    }
  }

  async function handleTogglePin(id: string) {
    const summary = allNotes.find((note) => note.id === id)

    if (!summary || summary.status !== "active") {
      return
    }

    try {
      if (draftRef.current?.id === id) {
        cancelScheduledSave()
        const next = {
          ...draftRef.current,
          isPinned: !draftRef.current.isPinned,
        }

        draftRef.current = next
        setDraftNote(next)
        setAllNotes((current) => replaceSummary(current, next))
        syncDraftOverride(next)
        return
      }

      const saved = await window.metisNote.notes.update(id, {
        isPinned: !summary.isPinned,
      })

      setAllNotes((current) => upsertSummary(current, saved))
      await refreshNoteSyncStates()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : messages.errors.togglePinFailed)
    }
  }

  async function handleToggleFavorite(id: string) {
    const summary = allNotes.find((note) => note.id === id)

    if (!summary || summary.status !== "active") {
      return
    }

    try {
      if (draftRef.current?.id === id) {
        cancelScheduledSave()
        const next = {
          ...draftRef.current,
          isFavorite: !draftRef.current.isFavorite,
        }

        draftRef.current = next
        setDraftNote(next)
        setAllNotes((current) => replaceSummary(current, next))
        syncDraftOverride(next)
        return
      }

      const saved = await window.metisNote.notes.update(id, {
        isFavorite: !summary.isFavorite,
      })

      setAllNotes((current) => upsertSummary(current, saved))
      await refreshNoteSyncStates()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : messages.errors.toggleFavoriteFailed)
    }
  }

  function handleTitleChange(title: string) {
    if (!draftNote || draftNote.status !== "active") {
      return
    }

    const normalizedTitle = title.trim() || messages.notes.emptyTitle
    const next = {
      ...draftNote,
      title: normalizedTitle,
    }

    draftRef.current = next
    setDraftNote(next)
    syncDraftOverride(next)
    setAllNotes((current) =>
      current.map((note) =>
        note.id === draftNote.id
          ? {
              ...note,
              title: normalizedTitle,
            }
          : note,
      ),
    )
  }

  function handleContentChange(content: NoteDocument["content"], plainText: string) {
    if (!draftNote || draftNote.status !== "active") {
      return
    }

    plainTextRef.current = plainText
    const preview = buildPreview(plainText, locale)
    const wordCount = countWords(plainText)
    const next = {
      ...draftNote,
      content,
      plainText,
      preview,
      wordCount,
    }

    draftRef.current = next
    setDraftNote(next)
    syncDraftOverride(next)

    setAllNotes((current) =>
      current.map((note) =>
        note.id === draftNote.id
          ? {
              ...note,
              preview,
              plainText,
              wordCount,
            }
          : note,
      ),
    )
  }

  function handleViewChange(view: NoteView) {
    setActiveScreen("notes")
    activeViewRef.current = view
    setActiveView(view)
  }

  async function handleOpenSettings() {
    await flushPendingSave()
    setIsFocusMode(false)
    setActiveScreen("settings")
  }

  function handleToggleFocusMode() {
    if (activeScreen !== "notes" || !draftRef.current) {
      return
    }

    setIsFocusMode((current) => !current)
  }

  const effectiveNoteSyncStates = noteSyncStates

  const syncBarContent = useMemo(() => {
    switch (syncStatus.state) {
      case "syncing": {
        const phaseLabel = messages.sync.phase[syncStatus.phase]
        const hasProgress = syncStatus.progress.totalFiles > 0
        const progressLabel = hasProgress
          ? `${Math.min(syncStatus.progress.completedFiles, syncStatus.progress.totalFiles)} / ${syncStatus.progress.totalFiles}`
          : null
        return {
          tone: "syncing" as const,
          label: progressLabel ? `${messages.sync.status.syncing} ${phaseLabel} ${progressLabel}` : `${messages.sync.status.syncing} ${phaseLabel}`,
        }
      }
      case "error":
        return { tone: "error" as const, label: `${messages.sync.status.error}: ${syncStatus.message}` }
      case "conflict":
        return { tone: "conflict" as const, label: `${messages.sync.status.conflict} (${messages.sync.result.conflicts(syncStatus.pendingCount)})` }
      case "idle": {
        const parts: string[] = [messages.sync.status.idle]

        if (lastSyncResult && lastSyncResult.status === "success") {
          if (lastSyncResult.pushed > 0) {
            parts.push(messages.sync.result.pushed(lastSyncResult.pushed))
          }
          if (lastSyncResult.pulled > 0) {
            parts.push(messages.sync.result.pulled(lastSyncResult.pulled))
          }
        }

        return { tone: "idle" as const, label: parts.join("  ·  ") }
      }
      case "disabled":
        return { tone: "disabled" as const, label: messages.sync.status.disabled }
      case "not-configured":
        return { tone: "not-configured" as const, label: messages.sync.status.notConfigured }
      default:
        return { tone: "idle" as const, label: "" }
    }
  }, [messages.sync.phase, messages.sync.result, messages.sync.status, syncStatus, lastSyncResult])

  useEffect(() => {
    void window.metisNote.sync.getStatus().then((status) => {
      setSyncStatus(status)
    }).catch(() => {
      // Sync may not be configured yet.
    })

    const disposeStatusChanged = window.metisNote.sync.onStatusChanged((status) => {
      setSyncStatus(status)

      // Only refresh per-note sync states when sync settles, not during
      // intermediate phases (scanning/uploading/etc.) to avoid stale reads.
      if (status.state !== "syncing") {
        void refreshNoteSyncStates()
      }

      if (status.state === "conflict") {
        setIsConflictDialogOpen(true)
      }
    })
    const disposeSyncCompleted = window.metisNote.sync.onSyncCompleted((result) => {
      setLastSyncResult(result)
      void (async () => {
        if (result.status === "success" && result.pulled > 0) {
          await refreshNotes(selectedIdRef.current, undefined, { reloadSelectedFromDisk: true })
          return
        }

        await refreshNoteSyncStates()
      })()
    })

    return () => {
      disposeStatusChanged()
      disposeSyncCompleted()
    }
  }, [refreshNoteSyncStates, refreshNotes])

  // Drafts stay local to the current session until explicitly saved.

  return (
    <main
      className={cn(
        "h-screen overflow-hidden bg-[#eef2f7] text-foreground transition-colors dark:bg-[#020817]",
        isFocusMode && "bg-[#edf2ff] dark:bg-[#020617]",
      )}
    >
      <section className="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-[#020817]">
        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          {!isFocusMode ? (
            <NoteSidebar
              activeScreen={activeScreen}
              activeView={activeView}
              counts={counts}
              onOpenSettings={() => {
                void handleOpenSettings()
              }}
              onViewChange={handleViewChange}
            />
          ) : null}

          {activeScreen === "notes" ? (
            <>
              {!isFocusMode ? (
                <NoteList
                  notes={visibleNotes}
                  selectedNoteId={selectedNoteId}
                  searchValue={searchValue}
                  activeView={activeView}
                  isLoading={isBooting}
                  noticeMessage={noticeMessage}
                  noteSyncStates={effectiveNoteSyncStates}
                  searchInputRef={searchInputRef}
                  onSearchChange={setSearchValue}
                  onCreateNote={handleCreateNote}
                  onImportNote={handleImportNote}
                  onSelectNote={handleSelectNote}
                  onDeselectNote={handleDeselectNote}
                  onTogglePin={handleTogglePin}
                  onToggleFavorite={handleToggleFavorite}
                  onMoveToTrash={handleMoveToTrash}
                  onRestoreNote={handleRestoreNote}
                  onDeleteForever={handleDeleteForever}
                  onOpenConflicts={() => setIsConflictDialogOpen(true)}
                />
              ) : null}

              <div className={cn("min-h-0 min-w-0 flex-1 border-t border-[#edf1f7] dark:border-[#1f2937] xl:border-t-0", isFocusMode && "border-t-0")}>
                <NoteEditor
                  key={draftNote?.id ?? "empty"}
                  allNotes={notesWithDraftOverrides}
                  note={draftNote}
                  requestedMode={editorOpenRequest.mode}
                  modeRequestId={editorOpenRequest.id}
                  isLoading={isLoadingNote}
                  isSaving={isSaving}
                  hasUnsavedChanges={Boolean(draftNote && hasPendingDraftChanges(draftNote))}
                  errorMessage={errorMessage}
                  lastSavedAt={lastSavedAt}
                  onTitleChange={handleTitleChange}
                  onContentChange={handleContentChange}
                  onMoveToTrash={() => {
                    if (draftNote) {
                      void handleMoveToTrash(draftNote.id)
                    }
                  }}
                  onDeleteForever={() => {
                    if (draftNote) {
                      void handleDeleteForever(draftNote.id)
                    }
                  }}
                  onExportNote={() => {
                    void handleExportNote()
                  }}
                  onExportPdf={() => {
                    void handleExportPdf()
                  }}
                  onPrintNote={() => {
                    void handlePrintNote()
                  }}
                  onSaveAsTemplate={() => handleOpenSaveTemplateDialog()}
                  onCommitEdits={() => handleManualCommitEdits()}
                  onRestoreVersion={handleRestoreVersion}
                  onOpenLinkedNote={handleOpenLinkedNote}
                  isFocusMode={isFocusMode}
                  onToggleFocusMode={handleToggleFocusMode}
                />
              </div>
            </>
          ) : (
            <div className="min-h-0 min-w-0 flex-1">
              <SettingsPage />
            </div>
          )}
        </div>

        {activeScreen === "notes" ? (
          <div className={cn(
            "flex shrink-0 items-center gap-2 border-t px-3 py-1 text-[11px]",
            syncBarContent.tone === "syncing"
              ? "border-[#d6e4ff] bg-[#f5f8ff] text-[#3b6de0] dark:border-[#24416e] dark:bg-[#0e1b33] dark:text-[#8eb8ff]"
              : syncBarContent.tone === "error"
                ? "border-[#f3d2d0] bg-[#fff5f5] text-[#c4342b] dark:border-[#5a2a2a] dark:bg-[#1c1010] dark:text-[#fda29b]"
                : syncBarContent.tone === "conflict"
                  ? "border-[#f3e0b5] bg-[#fffbf2] text-[#b54708] dark:border-[#5a4420] dark:bg-[#1c1508] dark:text-[#f5c26b]"
                  : syncBarContent.tone === "idle"
                    ? "border-[#e7ebf1] bg-[#f9fafb] text-[#5b6b85] dark:border-[#1f2937] dark:bg-[#0b1220] dark:text-slate-400"
                    : "border-[#e7ebf1] bg-[#f9fafb] text-[#98a2b3] dark:border-[#1f2937] dark:bg-[#0b1220] dark:text-slate-500",
          )}>
            <span className="inline-flex items-center justify-center">
              {syncBarContent.tone === "syncing" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : syncBarContent.tone === "error" ? (
                <AlertTriangle className="h-3 w-3" />
              ) : syncBarContent.tone === "conflict" ? (
                <AlertTriangle className="h-3 w-3" />
              ) : syncBarContent.tone === "idle" ? (
                <Check className="h-3 w-3" />
              ) : syncBarContent.tone === "disabled" ? (
                <CloudOff className="h-3 w-3" />
              ) : (
                <Settings2 className="h-3 w-3" />
              )}
            </span>
            <span className="truncate">{syncBarContent.label}</span>
          </div>
        ) : null}
      </section>

      <TemplateDialog
        open={isSaveTemplateDialogOpen}
        title={messages.settings.templates.dialog.saveCurrentTitle}
        closeLabel={messages.settings.templates.dialog.close}
        submitLabel={messages.settings.templates.dialog.save}
        cancelLabel={messages.settings.templates.dialog.cancel}
        titleLabel={messages.settings.templates.fields.title}
        descriptionLabel={messages.settings.templates.fields.description}
        categoryLabel={messages.settings.templates.fields.category}
        titlePlaceholder={messages.settings.templates.placeholders.title}
        descriptionPlaceholder={messages.settings.templates.placeholders.description}
        categoryPlaceholder={messages.settings.templates.placeholders.category}
        errorMessage={templateActionError}
        isSubmitting={isSubmittingTemplateAction}
        initialValues={{
          title: draftNote?.title ?? "",
          description: draftNote?.preview ?? "",
          category: messages.settings.templates.customCategoryFallback,
        }}
        onOpenChange={(open) => {
          setIsSaveTemplateDialogOpen(open)
          if (!open) {
            setTemplateActionError(null)
          }
        }}
        onSubmit={handleSaveTemplate}
      />
      <ConflictDialog open={isConflictDialogOpen} onOpenChange={setIsConflictDialogOpen} />
    </main>
  )
}
