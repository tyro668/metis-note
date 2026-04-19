import type { JSONContent } from "@tiptap/core"

export const ASSET_PROTOCOL = "asset"
export const DEFAULT_HIGHLIGHT_COLOR = "#fef08a"
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_FILE_BYTES = 50 * 1024 * 1024
export const MAX_NOTE_ASSET_BYTES = 200 * 1024 * 1024

export interface AssetUriParts {
  src: string
  noteId: string
  filename: string
  assetId: string
  ext: string
}

export interface AssetImportPayload {
  noteId: string
  filename: string
  sourcePath?: string
  bytes?: Uint8Array
  mimeType?: string
}

export interface RendererAssetImportPayload extends Omit<AssetImportPayload, "bytes"> {
  bytes?: ArrayBuffer | Uint8Array
}

export interface ImageAssetResult extends AssetUriParts {
  originalFilename: string
  width: number
  height: number
  size: number
  mimeType: string
}

export interface FileAssetResult extends AssetUriParts {
  originalFilename: string
  size: number
  mimeType: string
}

export interface AssetReference extends AssetUriParts {
  nodeType: "image" | "fileAttachment"
}

function normalizeFilename(value: string) {
  return value.replace(/^\/+/, "").trim()
}

export function getFileExtension(filename: string) {
  const normalized = normalizeFilename(filename)
  const lastDotIndex = normalized.lastIndexOf(".")

  if (lastDotIndex <= 0 || lastDotIndex === normalized.length - 1) {
    return ""
  }

  return normalized.slice(lastDotIndex + 1).toLowerCase()
}

export function stripFileExtension(filename: string) {
  const normalized = normalizeFilename(filename)
  const lastDotIndex = normalized.lastIndexOf(".")

  if (lastDotIndex <= 0) {
    return normalized
  }

  return normalized.slice(0, lastDotIndex)
}

export function buildAssetUri(noteId: string, filename: string) {
  return `${ASSET_PROTOCOL}://${encodeURIComponent(noteId)}/${encodeURIComponent(normalizeFilename(filename))}`
}

export function parseAssetUri(value: string): AssetUriParts | null {
  try {
    const url = new URL(value)

    if (url.protocol !== `${ASSET_PROTOCOL}:`) {
      return null
    }

    const noteId = decodeURIComponent(url.hostname)
    const filename = decodeURIComponent(url.pathname.replace(/^\/+/, ""))
    const assetId = stripFileExtension(filename)
    const ext = getFileExtension(filename)

    if (
      !noteId ||
      !filename ||
      !assetId ||
      noteId.includes("/") ||
      noteId.includes("\\") ||
      filename.includes("/") ||
      filename.includes("\\") ||
      filename.includes("..")
    ) {
      return null
    }

    return {
      src: value,
      noteId,
      filename,
      assetId,
      ext,
    }
  } catch {
    return null
  }
}

export function isAssetUri(value: string) {
  return parseAssetUri(value) !== null
}

export function isExternalUrl(value: string) {
  try {
    const protocol = new URL(value).protocol
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:" || protocol === "tel:"
  } catch {
    return false
  }
}

export function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size >= 10 * 1024 ? 0 : 1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

export function isImageExtension(ext: string) {
  return new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"]).has(ext.toLowerCase())
}

export function extractReferencedAssets(content: JSONContent | null | undefined): AssetReference[] {
  const assets: AssetReference[] = []

  function visit(node: JSONContent | null | undefined) {
    if (!node) {
      return
    }

    if ((node.type === "image" || node.type === "fileAttachment") && typeof node.attrs?.src === "string") {
      const parsed = parseAssetUri(node.attrs.src)

      if (parsed) {
        assets.push({
          ...parsed,
          nodeType: node.type,
        })
      }
    }

    for (const child of node.content ?? []) {
      visit(child)
    }
  }

  visit(content)

  return assets
}

export function mapAssetSources(
  content: JSONContent,
  mapper: (source: string, nodeType: AssetReference["nodeType"], node: JSONContent) => string,
): JSONContent {
  function visit(node: JSONContent): JSONContent {
    const mappedChildren = node.content?.map((child) => visit(child))
    let nextNode = mappedChildren ? { ...node, content: mappedChildren } : node

    if ((node.type === "image" || node.type === "fileAttachment") && typeof node.attrs?.src === "string") {
      const nextSource = mapper(node.attrs.src, node.type, node)

      if (nextSource !== node.attrs.src) {
        nextNode = {
          ...nextNode,
          attrs: {
            ...(nextNode.attrs ?? {}),
            src: nextSource,
          },
        }
      }
    }

    return nextNode
  }

  return visit(content)
}
