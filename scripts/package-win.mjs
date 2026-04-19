import { cp, mkdir, rename, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { appName, copyAppPayload, readPackageVersion } from "./package-utils.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const version = await readPackageVersion(rootDir)
const electronTemplateDir = path.join(rootDir, "node_modules", "electron", "dist")
const releaseDir = path.join(rootDir, "release")
const appContainerDir = path.join(releaseDir, `${appName}-${process.platform}-${process.arch}`)
const appResourcesDir = path.join(appContainerDir, "resources", "app")
const electronExePath = path.join(appContainerDir, "electron.exe")
const appExePath = path.join(appContainerDir, `${appName}.exe`)

async function main() {
  if (process.platform !== "win32") {
    throw new Error("package-win.mjs must be run on Windows.")
  }

  await rm(appContainerDir, { recursive: true, force: true })
  await mkdir(releaseDir, { recursive: true })
  await cp(electronTemplateDir, appContainerDir, { recursive: true })
  await copyAppPayload(rootDir, appResourcesDir, version)

  await rm(appExePath, { force: true })
  await rename(electronExePath, appExePath)

  console.log(`Packaged app created at: ${appContainerDir}`)
}

await main()
