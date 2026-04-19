import { access, mkdir, rename, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { appName, copyAppPayload, copyDirectory, readPackageVersion } from "./package-utils.mjs"
import { rcedit } from "rcedit"

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

  try {
    await access(customIconPath)
    await rcedit(appExePath, {
      icon: customIconPath,
      "file-version": windowsVersion,
      "product-version": windowsVersion,
      "version-string": {
        CompanyName: "Metis",
        FileDescription: appName,
        ProductName: appName,
        OriginalFilename: `${appName}.exe`,
      },
    })
  } catch (error) {
    console.warn(`[metis-note] Failed to apply Windows icon metadata from ${customIconPath}.`, error)
  }

  console.log(`Packaged app created at: ${appContainerDir}`)
}

await main()
