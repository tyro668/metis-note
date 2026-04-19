import { randomUUID } from "node:crypto"
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import type { JSONContent } from "@tiptap/core"
import { BrowserWindow, dialog, nativeImage, shell, type OpenDialogOptions } from "electron"
import { getMessages, type AppLocale } from "../../../src/shared/i18n"
import {
  buildAssetUri,
  extractReferencedAssets,
  formatFileSize,
  getFileExtension,
  isAssetUri,
  isExternalUrl,
  isImageExtension,
  mapAssetSources,
  parseAssetUri,
  stripFileExtension,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_NOTE_ASSET_BYTES,
  type AssetImportPayload,
  type FileAssetResult,
  type ImageAssetResult,
} from "../../../src/shared/assets"

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "application/pdf": "pdf",
  "text/plain": "txt",
}

function sanitizeOriginalFilename(value: string, fallbackExtension = "") {
  const safeBaseName = path
    .basename(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .trim()

  if (safeBaseName) {
    return safeBaseName
  }

  return fallbackExtension ? `asset.${fallbackExtension}` : "asset"
}

function normalizeMimeType(value: string | undefined, extension: string) {
  return value?.trim() || MIME_BY_EXTENSION[extension] || "application/octet-stream"
}

function normalizeStoredExtension(filename: string, mimeType?: string) {
  const extension = getFileExtension(filename)

  if (extension) {
    return extension
  }

  return EXTENSION_BY_MIME[mimeType?.trim() ?? ""] ?? "bin"
}

function toForwardSlashPath(value: string) {
  return value.split(path.sep).join("/")
}

export class AssetStore {
  private readonly assetsDir: string
  private readonly messages
  private initialized = false

  constructor(baseDir: string, locale: AppLocale) {
    this.assetsDir = path.join(baseDir, "assets")
    this.messages = getMessages(locale)
  }

  async ensureReady() {
    if (this.initialized) {
      return
    }

    await mkdir(this.assetsDir, { recursive: true })
    this.initialized = true
  }

  async handleProtocolRequest(request: Request) {
    const filePath = this.resolveAssetPath(request.url)

    if (!filePath) {
      return new Response("Not found", { status: 404 })
    }

    try {
      const body = await readFile(filePath)
      const mimeType = normalizeMimeType(undefined, getFileExtension(filePath))

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": mimeType,
          "cache-control": "no-store",
        },
      })
    } catch {
      return new Response("Not found", { status: 404 })
    }
  }

  async pickAndImportImage(noteId: string, parentWindow?: BrowserWindow) {
    await this.ensureReady()

    const options: OpenDialogOptions = {
      title: this.messages.editor.commands.image,
      properties: ["openFile"],
      filters: [
        {
          name: this.messages.editor.assets.imageFilterName,
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"],
        },
      ],
    }
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const sourcePath = result.filePaths[0]

    return this.importImage({
      noteId,
      sourcePath,
      filename: path.basename(sourcePath),
    })
  }

  async pickAndImportFile(noteId: string, parentWindow?: BrowserWindow) {
    await this.ensureReady()

    const options: OpenDialogOptions = {
      title: this.messages.editor.commands.file,
      properties: ["openFile"],
    }
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const sourcePath = result.filePaths[0]

    return this.importFile({
      noteId,
      sourcePath,
      filename: path.basename(sourcePath),
    })
  }

  async importImage(payload: AssetImportPayload): Promise<ImageAssetResult> {
    await this.ensureReady()

    const source = await this.readIncomingSource(payload)
    const originalFilename = sanitizeOriginalFilename(payload.filename, "png")
    const extension = normalizeStoredExtension(originalFilename, source.mimeType)

    if (!isImageExtension(extension)) {
      throw new Error(this.messages.editor.assets.invalidImage)
    }

    if (source.size > MAX_IMAGE_BYTES) {
      throw new Error(this.messages.editor.assets.imageTooLarge(formatFileSize(MAX_IMAGE_BYTES)))
    }

    await this.ensureNoteCapacity(payload.noteId, source.size)

    const image = nativeImage.createFromBuffer(Buffer.from(source.bytes))
    const dimensions = image.getSize()

    if (!dimensions.width || !dimensions.height) {
      throw new Error(this.messages.editor.assets.invalidImage)
    }

    const assetId = randomUUID()
    const filename = `${assetId}.${extension}`

    await this.writeAssetFile(payload.noteId, filename, source.bytes)

    return {
      assetId,
      noteId: payload.noteId,
      filename,
      originalFilename,
      ext: extension,
      src: buildAssetUri(payload.noteId, filename),
      width: dimensions.width,
      height: dimensions.height,
      size: source.size,
      mimeType: normalizeMimeType(source.mimeType, extension),
    }
  }

  async importFile(payload: AssetImportPayload): Promise<FileAssetResult> {
    await this.ensureReady()

    const source = await this.readIncomingSource(payload)
    const originalFilename = sanitizeOriginalFilename(payload.filename)
    const extension = normalizeStoredExtension(originalFilename, source.mimeType)

    if (source.size > MAX_FILE_BYTES) {
      throw new Error(this.messages.editor.assets.fileTooLarge(formatFileSize(MAX_FILE_BYTES)))
    }

    await this.ensureNoteCapacity(payload.noteId, source.size)

    const assetId = randomUUID()
    const filename = `${assetId}.${extension}`

    await this.writeAssetFile(payload.noteId, filename, source.bytes)

    return {
      assetId,
      noteId: payload.noteId,
      filename,
      originalFilename,
      ext: extension,
      src: buildAssetUri(payload.noteId, filename),
      size: source.size,
      mimeType: normalizeMimeType(source.mimeType, extension),
    }
  }

  async openFile(source: string) {
    const filePath = this.resolveAssetPath(source)

    if (!filePath) {
      throw new Error(this.messages.editor.assets.assetNotFound)
    }

    const errorMessage = await shell.openPath(filePath)

    if (errorMessage) {
      throw new Error(errorMessage)
    }
  }

  async cleanupUnreferenced(noteId: string, content: JSONContent) {
    await this.ensureReady()

    const noteDir = this.noteAssetDir(noteId)
    const referenced = new Set(
      extractReferencedAssets(content)
        .filter((asset) => asset.noteId === noteId)
        .map((asset) => asset.filename),
    )
    const diskFiles = await this.listNoteFiles(noteId)

    await Promise.all(
      diskFiles
        .filter((filename) => !referenced.has(filename))
        .map((filename) => rm(path.join(noteDir, filename), { force: true })),
    )

    const remainingFiles = await this.listNoteFiles(noteId)

    if (remainingFiles.length === 0) {
      await rm(noteDir, { recursive: true, force: true })
    }
  }

  async deleteNoteAssets(noteId: string) {
    await this.ensureReady()
    await rm(this.noteAssetDir(noteId), { recursive: true, force: true })
  }

  async cloneReferencedAssets(content: JSONContent, targetNoteId: string) {
    await this.ensureReady()

    const references = [...new Map(extractReferencedAssets(content).map((asset) => [asset.src, asset])).values()]

    if (references.length === 0) {
      return content
    }

    await mkdir(this.noteAssetDir(targetNoteId), { recursive: true })

    const nextSources = new Map<string, string>()

    for (const reference of references) {
      const sourcePath = this.resolveAssetPath(reference.src)

      if (!sourcePath) {
        continue
      }

      const targetPath = path.join(this.noteAssetDir(targetNoteId), reference.filename)
      await copyFile(sourcePath, targetPath)
      nextSources.set(reference.src, buildAssetUri(targetNoteId, reference.filename))
    }

    return mapAssetSources(content, (source) => nextSources.get(source) ?? source)
  }

  async importContentAssets(noteId: string, content: JSONContent, sourceDir: string): Promise<JSONContent> {
    await this.ensureReady()

    const visit = async (node: JSONContent): Promise<JSONContent> => {
      const nextChildren = node.content ? await Promise.all(node.content.map((child) => visit(child))) : undefined
      let nextNode = nextChildren ? { ...node, content: nextChildren } : node

      if ((node.type === "image" || node.type === "fileAttachment") && typeof node.attrs?.src === "string") {
        const source = node.attrs.src

        if (!isAssetUri(source) && !isExternalUrl(source)) {
          const sourcePath = path.isAbsolute(source) ? source : path.resolve(sourceDir, source)

          if (node.type === "image") {
            const imported = await this.importImage({
              noteId,
              sourcePath,
              filename: path.basename(sourcePath),
            })

            nextNode = {
              ...nextNode,
              attrs: {
                ...(nextNode.attrs ?? {}),
                src: imported.src,
                alt: typeof nextNode.attrs?.alt === "string" && nextNode.attrs.alt.trim()
                  ? nextNode.attrs.alt
                  : stripFileExtension(imported.originalFilename),
                width: imported.width,
                height: imported.height,
                size: imported.size,
              },
            }
          } else {
            const imported = await this.importFile({
              noteId,
              sourcePath,
              filename: path.basename(sourcePath),
            })

            nextNode = {
              ...nextNode,
              attrs: {
                ...(nextNode.attrs ?? {}),
                src: imported.src,
                filename:
                  typeof nextNode.attrs?.filename === "string" && nextNode.attrs.filename.trim()
                    ? nextNode.attrs.filename
                    : imported.originalFilename,
                size: imported.size,
                mimeType: imported.mimeType,
              },
            }
          }
        }
      }

      return nextNode
    }

    return visit(content)
  }

  async exportReferencedAssets(content: JSONContent, exportDir: string) {
    await this.ensureReady()

    const references = [...new Map(extractReferencedAssets(content).map((asset) => [asset.src, asset])).values()]
    const mappings = new Map<string, string>()

    if (references.length === 0) {
      return mappings
    }

    await mkdir(exportDir, { recursive: true })

    for (const reference of references) {
      const sourcePath = this.resolveAssetPath(reference.src)

      if (!sourcePath) {
        continue
      }

      const targetPath = path.join(exportDir, reference.filename)
      await copyFile(sourcePath, targetPath)
      mappings.set(reference.src, toForwardSlashPath(path.relative(path.dirname(exportDir), targetPath)))
    }

    return mappings
  }

  resolveAssetPath(source: string) {
    const parsed = parseAssetUri(source)

    if (!parsed) {
      return null
    }

    return path.join(this.noteAssetDir(parsed.noteId), parsed.filename)
  }

  private noteAssetDir(noteId: string) {
    return path.join(this.assetsDir, noteId)
  }

  private async writeAssetFile(noteId: string, filename: string, bytes: Uint8Array) {
    const noteDir = this.noteAssetDir(noteId)
    await mkdir(noteDir, { recursive: true })
    await writeFile(path.join(noteDir, filename), bytes)
  }

  private async readIncomingSource(payload: AssetImportPayload) {
    if (payload.sourcePath) {
      const filePath = path.resolve(payload.sourcePath)
      const [file, metadata] = await Promise.all([readFile(filePath), stat(filePath)])

      return {
        bytes: new Uint8Array(file),
        size: metadata.size,
        mimeType: payload.mimeType ?? normalizeMimeType(undefined, getFileExtension(payload.filename || filePath)),
      }
    }

    if (payload.bytes) {
      return {
        bytes: payload.bytes,
        size: payload.bytes.byteLength,
        mimeType: payload.mimeType ?? normalizeMimeType(undefined, getFileExtension(payload.filename)),
      }
    }

    throw new Error(this.messages.editor.assets.assetNotFound)
  }

  private async ensureNoteCapacity(noteId: string, incomingSize: number) {
    const currentSize = await this.getNoteAssetSize(noteId)

    if (currentSize + incomingSize > MAX_NOTE_ASSET_BYTES) {
      throw new Error(this.messages.editor.assets.noteAssetLimitExceeded(formatFileSize(MAX_NOTE_ASSET_BYTES)))
    }
  }

  private async getNoteAssetSize(noteId: string) {
    const files = await this.listNoteFiles(noteId)

    const sizes = await Promise.all(
      files.map(async (filename) => {
        const metadata = await stat(path.join(this.noteAssetDir(noteId), filename))
        return metadata.size
      }),
    )

    return sizes.reduce((total, size) => total + size, 0)
  }

  private async listNoteFiles(noteId: string) {
    try {
      const entries = await readdir(this.noteAssetDir(noteId), { withFileTypes: true })
      return entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
    } catch {
      return []
    }
  }
}
