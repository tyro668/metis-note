import { access, mkdir, readFile, rename, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { appName, copyAppPayload, copyDirectory, readPackageVersion } from "./package-utils.mjs"
import rcedit from "rcedit"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const version = await readPackageVersion(rootDir)
const electronTemplateDir = path.join(rootDir, "node_modules", "electron", "dist")
const releaseDir = path.join(rootDir, "release")
const appContainerDir = path.join(releaseDir, `${appName}-${process.platform}-${process.arch}`)
const appResourcesDir = path.join(appContainerDir, "resources", "app")
const electronExePath = path.join(appContainerDir, "electron.exe")
const appExePath = path.join(appContainerDir, `${appName}.exe`)
const customIconPath = path.join(rootDir, "public", "icon.ico")

function toWindowsVersion(version) {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10) || 0)
  while (parts.length < 4) {
    parts.push(0)
  }
  return parts.slice(0, 4).join(".")
}

function readIcoEntries(iconBuffer) {
  const reserved = iconBuffer.readUInt16LE(0)
  const type = iconBuffer.readUInt16LE(2)
  const count = iconBuffer.readUInt16LE(4)

  if (reserved !== 0 || type !== 1 || count <= 0) {
    throw new Error("Invalid ICO file.")
  }

  const entries = []
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16
    const bytesInRes = iconBuffer.readUInt32LE(offset + 8)
    const imageOffset = iconBuffer.readUInt32LE(offset + 12)
    entries.push(iconBuffer.subarray(imageOffset, imageOffset + bytesInRes))
  }

  return entries
}

async function assertExeContainsIcon(exePath, iconPath) {
  const [iconBuffer, exeBuffer] = await Promise.all([readFile(iconPath), readFile(exePath)])
  const iconEntries = readIcoEntries(iconBuffer)
  const missingEntries = iconEntries.filter((entry) => !exeBuffer.includes(entry))

  if (missingEntries.length > 0) {
    throw new Error(`Packaged EXE is missing ${missingEntries.length} icon resource entries from ${iconPath}.`)
  }
}

async function main() {
  if (process.platform !== "win32") {
    throw new Error("package-win.mjs must be run on Windows.")
  }

  await rm(appContainerDir, { recursive: true, force: true })
  await mkdir(releaseDir, { recursive: true })
  await copyDirectory(electronTemplateDir, appContainerDir)
  await copyAppPayload(rootDir, appResourcesDir, version)

  await rm(appExePath, { force: true })
  await rename(electronExePath, appExePath)
  const windowsVersion = toWindowsVersion(version)

  await access(customIconPath)
  await rcedit(appExePath, {
    icon: customIconPath,
    "file-version": windowsVersion,
    "product-version": windowsVersion,
    "version-string": {
      CompanyName: "Metis",
      FileDescription: appName,
      InternalFilename: appName,
      ProductName: appName,
      OriginalFilename: `${appName}.exe`,
    },
  })
  await assertExeContainsIcon(appExePath, customIconPath)

  console.log(`Packaged app created at: ${appContainerDir}`)
}

await main()
