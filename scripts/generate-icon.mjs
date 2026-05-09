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
const requestedTargets = new Set(process.argv.slice(2))
const unknownTargets = [...requestedTargets].filter((target) => target !== "--mac" && target !== "--windows")

if (unknownTargets.length > 0) {
  console.error(`Unknown icon generation target: ${unknownTargets.join(", ")}`)
  console.error("Usage: node scripts/generate-icon.mjs [--mac] [--windows]")
  process.exit(1)
}

const generateMacIcon = requestedTargets.size === 0 || requestedTargets.has("--mac")
const generateWindowsIcon = requestedTargets.size === 0 || requestedTargets.has("--windows")
const requireMacIcon = requestedTargets.has("--mac") && !requestedTargets.has("--windows")
const pythonCandidates = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"]

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

function assertRsvgConvertAvailable() {
  try {
    execFileSync("rsvg-convert", ["--version"], { stdio: "ignore" })
  } catch {
    console.error("rsvg-convert is required to generate app icons.")
    console.error("macOS: brew install librsvg")
    console.error("Windows: install librsvg and make sure rsvg-convert is available on PATH")
    process.exit(1)
  }
}

function runPythonIconGenerator(args) {
  let missingPythonError = null

  for (const command of pythonCandidates) {
    try {
      execFileSync(command, args)
      return
    } catch (error) {
      if (error.code === "ENOENT") {
        missingPythonError = error
        continue
      }

      throw error
    }
  }

  console.error("Python is required to generate the Windows .ico file.")
  console.error("Install Python with Pillow, then rerun the icon generation command.")
  throw missingPythonError ?? new Error("Python executable was not found.")
}

async function main() {
  assertRsvgConvertAvailable()

  const tmpDir = await mkdtemp(path.join(tmpdir(), "metis-icon-"))
  const iconsetDir = path.join(tmpDir, "icon.iconset")
  const windowsIconDir = path.join(tmpDir, "windows")

  try {
    if (generateMacIcon) {
      await mkdir(iconsetDir)
      for (const variant of macIconVariants) {
        execFileSync("rsvg-convert", [
          "-w", String(variant.size),
          "-h", String(variant.size),
          svgPath,
          "-o", path.join(iconsetDir, variant.fileName),
        ])
      }

      await mkdir(path.dirname(macOutputPath), { recursive: true })
      try {
        execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", macOutputPath])
        console.log(`macOS icon created at: ${macOutputPath}`)
      } catch (error) {
        if (requireMacIcon) {
          throw error
        }
        console.warn(`[metis-note] Failed to regenerate macOS icon at ${macOutputPath}.`, error)
      }
    }

    if (generateWindowsIcon) {
      await mkdir(windowsIconDir)
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

      runPythonIconGenerator([
        path.join(__dirname, "generate-windows-icon.py"),
        windowsOutputPath,
        ...windowsPngPaths,
      ])
      await copyFile(windowsOutputPath, publicWindowsOutputPath)
      console.log(`Windows icon copied to: ${publicWindowsOutputPath}`)
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

await main()
