import { execFileSync } from "node:child_process"
import { mkdtemp, rm, mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const svgPath = path.join(rootDir, "public", "logo.svg")
const outputPath = path.join(rootDir, "build", "icon.icns")

const sizes = [16, 32, 64, 128, 256, 512, 1024]

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
  await mkdir(iconsetDir)

  try {
    for (const size of sizes) {
      const name = size === 1024
        ? `icon_512x512@2x.png`
        : `icon_${size}x${size}.png`

      execFileSync("rsvg-convert", [
        "-w", String(size),
        "-h", String(size),
        svgPath,
        "-o", path.join(iconsetDir, name),
      ])

      // Also generate @2x variants (except for 1024 which is already 512@2x)
      if (size <= 512 && size * 2 <= 1024) {
        const retinaName = `icon_${size}x${size}@2x.png`
        execFileSync("rsvg-convert", [
          "-w", String(size * 2),
          "-h", String(size * 2),
          svgPath,
          "-o", path.join(iconsetDir, retinaName),
        ])
      }
    }

    await mkdir(path.dirname(outputPath), { recursive: true })
    execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", outputPath])
    console.log(`Icon created at: ${outputPath}`)
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

await main()
