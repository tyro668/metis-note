import { mkdir, rm, utimes } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { appName, bundleId, copyAppPayload, readPackageVersion, run } from "./package-utils.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const version = await readPackageVersion(rootDir)
const electronTemplatePath = path.join(rootDir, "node_modules", "electron", "dist", "Electron.app")
const releaseDir = path.join(rootDir, "release")
const appContainerDir = path.join(releaseDir, `${appName}-${process.platform}-${process.arch}`)
const appBundlePath = path.join(appContainerDir, `${appName}.app`)
const plistPath = path.join(appBundlePath, "Contents", "Info.plist")
const appResourcesDir = path.join(appBundlePath, "Contents", "Resources", "app")

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("package-mac.mjs must be run on macOS.")
  }

  await rm(appContainerDir, { recursive: true, force: true })
  await mkdir(releaseDir, { recursive: true })
  run(rootDir, "ditto", [electronTemplatePath, appBundlePath])

  await copyAppPayload(rootDir, appResourcesDir, version)

  run(rootDir, "plutil", ["-replace", "CFBundleDisplayName", "-string", appName, plistPath])
  run(rootDir, "plutil", ["-replace", "CFBundleName", "-string", appName, plistPath])
  run(rootDir, "plutil", ["-replace", "CFBundleIdentifier", "-string", bundleId, plistPath])
  run(rootDir, "plutil", ["-replace", "CFBundleShortVersionString", "-string", version, plistPath])
  run(rootDir, "plutil", ["-replace", "CFBundleVersion", "-string", version, plistPath])
  run(rootDir, "plutil", ["-replace", "LSApplicationCategoryType", "-string", "public.app-category.productivity", plistPath])
  run(rootDir, "codesign", ["--force", "--deep", "--sign", "-", "--timestamp=none", appBundlePath])

  const now = new Date()
  await utimes(appBundlePath, now, now)
  await utimes(appContainerDir, now, now)

  console.log(`Packaged app created at: ${appBundlePath}`)
}

await main()
