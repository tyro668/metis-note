import { execFileSync } from "node:child_process"
import { mkdtemp, rm, mkdir, copyFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const svgPath = path.join(rootDir, "public", "logo.svg")
const macOutputPath = path.join(rootDir, "build", "icon.icns")
const windowsOutputPath = path.join(rootDir, "build", "icon.ico")
const publicWindowsOutputPath = path.join(rootDir, "public", "icon.ico")

const macIconVariants = [
  { fileName: "icon_16x16.png", size: 16 },
  { fileName: "icon_16x16@2x.png", size: 32 },
  { fileName: "icon_32x32.png", size: 32 },
  { fileName: "icon_32x32@2x.png", size: 64 },
  { fileName: "icon_128x128.png", size: 128 },
  { fileName: "icon_128x128@2x.png", size: 256 },
  { fileName: "icon_256x256.png", size: 256 },
  { fileName: "icon_256x256@2x.png", size: 512 },
  { fileName: "icon_512x512.png", size: 512 },
  { fileName: "icon_512x512@2x.png", size: 1024 },
]
const windowsSizes = [16, 24, 32, 48, 64, 128, 256]

async function main() {
  // Check for rsvg-convert (from librsvg)
  try {
    execFileSync("which", ["rsvg-convert"])
  } catch {
    console.error("rsvg-convert is required. Install via: brew install librsvg")
    process.exit(1)
  }

  const tmpDir = await mkdtemp(path.join(tmpdir(), "metis-icon-"))
  const iconsetDir = path.join(tmpDir, "icon.iconset")
  const windowsIconDir = path.join(tmpDir, "windows")
  await mkdir(iconsetDir)
  await mkdir(windowsIconDir)

  try {
    for (const variant of macIconVariants) {
      execFileSync("rsvg-convert", [
        "-w", String(variant.size),
        "-h", String(variant.size),
        svgPath,
        "-o", path.join(iconsetDir, variant.fileName),
      ])
    }

    const windowsPngPaths = []
    for (const size of windowsSizes) {
      const outputPath = path.join(windowsIconDir, `${size}.png`)
      execFileSync("rsvg-convert", [
        "-w", String(size),
        "-h", String(size),
        svgPath,
        "-o", outputPath,
      ])
      windowsPngPaths.push(outputPath)
    }

    execFileSync("python3", [
      path.join(__dirname, "generate-windows-icon.py"),
      windowsOutputPath,
      ...windowsPngPaths,
    ])
    await copyFile(windowsOutputPath, publicWindowsOutputPath)
    console.log(`Windows icon copied to: ${publicWindowsOutputPath}`)

    await mkdir(path.dirname(macOutputPath), { recursive: true })
    try {
      execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", macOutputPath])
      console.log(`macOS icon created at: ${macOutputPath}`)
    } catch (error) {
      console.warn(`[metis-note] Failed to regenerate macOS icon at ${macOutputPath}.`, error)
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

await main()
