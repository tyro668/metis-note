import { startTransition, useEffect, useRef, useState } from "react"
import { NoteEditor } from "@/components/note-editor"
import { NoteList } from "@/components/note-list"
import { NoteSidebar } from "@/components/note-sidebar"
import { SettingsPage } from "@/components/settings-page"
import { useI18n } from "@/i18n/provider"
import {
  buildNotePathTitles,
  buildPreview,
  countWords,
  normalizeTags,
  type CreateNoteInput,
  type NoteDocument,
  type NoteSummary,
  type NoteView,
} from "@/shared/notes"

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

function sortNotes(list: NoteSummary[]) {
  return [...list].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

function upsertSummary(list: NoteSummary[], note: NoteSummary) {
  return sortNotes([note, ...list.filter((item) => item.id !== note.id)])
}

function replaceSummary(list: NoteSummary[], note: NoteSummary) {
  return sortNotes(list.map((item) => (item.id === note.id ? note : item)))
}

function matchesSearch(note: NoteSummary, keyword: string) {
  return [note.title, note.preview, note.plainText, note.tags.join(" ")]
    .join(" ")
    .toLowerCase()
    .includes(keyword)
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
    filtered = filtered.filter((note) => note.isPinned)
  }

  if (keyword) {
    filtered = filtered.filter((note) => matchesSearch(note, keyword))
  }

  return [...filtered].sort((left, right) => {
    if (view !== "trash" && left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1
    }

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  })
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
    favorites: notes.filter((note) => note.status === "active" && note.isPinned).length,
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
  const selectedIdRef = useRef<string | null>(null)
  const draftRef = useRef<NoteDocument | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const pendingSaveRef = useRef<Promise<unknown> | null>(null)
  const lastPersistedSnapshotRef = useRef<string | null>(null)
  const plainTextRef = useRef("")
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchValueRef = useRef("")
  const activeViewRef = useRef<NoteView>("all")

  const visibleNotes = filterNotes(allNotes, activeView, searchValue)
  const counts = countsFor(allNotes)
  const draftPathTitles = buildNotePathTitles(allNotes, draftNote?.id ?? null)

  function requestEditorOpenMode(mode: EditorOpenMode) {
    setEditorOpenRequest((current) => ({
      mode,
      id: current.id + 1,
    }))
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

        startTransition(() => {
          setAllNotes(nextNotes)
        })

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
        plainTextRef.current = note?.plainText ?? ""

        startTransition(() => {
          setDraftNote(note)
        })

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
    if (!draftNote || draftNote.status !== "active") {
      return
    }

    const snapshot = noteSnapshot(draftNote)

    if (!snapshot || snapshot === lastPersistedSnapshotRef.current) {
      return
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      const current = draftRef.current

      if (!current || current.status !== "active") {
        return
      }

      pendingSaveRef.current = persistNote(current, plainTextRef.current).finally(() => {
        pendingSaveRef.current = null
      })
    }, 700)

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [draftNote])

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
      if (!event.metaKey && !event.ctrlKey) {
        return
      }

      const key = event.key.toLowerCase()

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
        void flushPendingSave()
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

  async function refreshNotes(preferredId?: string | null, preferredMode?: EditorOpenMode) {
    const nextNotes = await window.metisNote.notes.list()
    const previousSelectedId = selectedIdRef.current

    startTransition(() => {
      setAllNotes(nextNotes)
    })

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

    return {
      notes: nextNotes,
      selectedId: nextSelectedId,
    }
  }

  function cancelScheduledSave() {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }

  async function persistNote(note: NoteDocument, plainText: string) {
    const snapshot = noteSnapshot(note)

    if (!snapshot || snapshot === lastPersistedSnapshotRef.current) {
      return
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
      draftRef.current = saved
      setDraftNote((current) => (current && current.id === saved.id ? saved : current))
      setAllNotes((current) => upsertSummary(current, saved))
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

    const current = draftRef.current

    if (current && current.status === "active") {
      await persistNote(current, plainTextRef.current)
    }

    if (pendingSaveRef.current) {
      await pendingSaveRef.current
    }
  }

  function getSelectedActiveSummary() {
    if (activeViewRef.current === "trash") {
      return null
    }

    return allNotes.find((note) => note.id === selectedIdRef.current && note.status === "active") ?? null
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

        setDraftNote(next)
        setAllNotes((current) => replaceSummary(current, next))
        await persistNote(next, plainTextRef.current)
        setNoticeMessage(next.isPinned ? messages.notices.pinned : messages.notices.unpinned)
        return
      }

      const saved = await window.metisNote.notes.update(id, {
        isPinned: !summary.isPinned,
      })

      setAllNotes((current) => upsertSummary(current, saved))
      setNoticeMessage(saved.isPinned ? messages.notices.pinned : messages.notices.unpinned)
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

  function handleTagsChange(tags: string[]) {
    if (!draftNote || draftNote.status !== "active") {
      return
    }

    const normalizedTags = normalizeTags(tags)
    const next = {
      ...draftNote,
      tags: normalizedTags,
    }

    draftRef.current = next
    setDraftNote(next)
    setAllNotes((current) =>
      current.map((note) =>
        note.id === draftNote.id
          ? {
              ...note,
              tags: normalizedTags,
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
    setActiveScreen("settings")
  }

  return (
    <main className="h-screen overflow-hidden bg-[#eef2f7] text-foreground">
      <section className="flex h-full w-full flex-col overflow-hidden bg-white">
        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <NoteSidebar
            activeScreen={activeScreen}
            activeView={activeView}
            counts={counts}
            onOpenSettings={() => {
              void handleOpenSettings()
            }}
            onViewChange={handleViewChange}
          />

          {activeScreen === "notes" ? (
            <>
              <NoteList
                notes={visibleNotes}
                selectedNoteId={selectedNoteId}
                searchValue={searchValue}
                activeView={activeView}
                isLoading={isBooting}
                noticeMessage={noticeMessage}
                searchInputRef={searchInputRef}
                onSearchChange={setSearchValue}
                onCreateNote={handleCreateNote}
                onImportNote={handleImportNote}
                onSelectNote={handleSelectNote}
                onTogglePin={handleTogglePin}
                onMoveToTrash={handleMoveToTrash}
                onRestoreNote={handleRestoreNote}
                onDeleteForever={handleDeleteForever}
              />

              <div className="min-h-0 min-w-0 flex-1 border-t border-[#edf1f7] xl:border-t-0">
                <NoteEditor
                  key={draftNote?.id ?? "empty"}
                  allNotes={allNotes}
                  note={draftNote}
                  pathTitles={draftPathTitles}
                  requestedMode={editorOpenRequest.mode}
                  modeRequestId={editorOpenRequest.id}
                  isLoading={isLoadingNote}
                  isSaving={isSaving}
                  errorMessage={errorMessage}
                  lastSavedAt={lastSavedAt}
                  onTitleChange={handleTitleChange}
                  onTagsChange={handleTagsChange}
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
                  onCommitEdits={() => flushPendingSave()}
                  onOpenLinkedNote={handleOpenLinkedNote}
                />
              </div>
            </>
          ) : (
            <div className="min-h-0 min-w-0 flex-1">
              <SettingsPage />
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
