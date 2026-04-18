import { cp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const appName = "MetisNote"
const bundleId = "com.metisnote.app"
const version = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf-8")).version
const electronTemplatePath = path.join(rootDir, "node_modules", "electron", "dist", "Electron.app")
const releaseDir = path.join(rootDir, "release")
const appContainerDir = path.join(releaseDir, `${appName}-darwin-arm64`)
const appBundlePath = path.join(appContainerDir, `${appName}.app`)
const plistPath = path.join(appBundlePath, "Contents", "Info.plist")
const appResourcesDir = path.join(appBundlePath, "Contents", "Resources", "app")

function run(command, args) {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
  })
}

function read(command, args) {
  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
  })
}

async function copyProductionNodeModules(appResourcesDir) {
  const packagePaths = [...new Set(read("npm", ["ls", "--omit=dev", "--all", "--parseable"]).split(/\r?\n/).filter(Boolean))]

  for (const packagePath of packagePaths) {
    const relativePath = path.relative(rootDir, packagePath)

    if (!relativePath || relativePath.startsWith("..") || !relativePath.startsWith("node_modules")) {
      continue
    }

    const destinationPath = path.join(appResourcesDir, relativePath)
    await mkdir(path.dirname(destinationPath), { recursive: true })
    await cp(packagePath, destinationPath, { recursive: true })
  }
}

async function main() {
  await rm(appContainerDir, { recursive: true, force: true })
  await mkdir(releaseDir, { recursive: true })
  run("ditto", [electronTemplatePath, appBundlePath])

  await mkdir(appResourcesDir, { recursive: true })
  await cp(path.join(rootDir, "dist"), path.join(appResourcesDir, "dist"), { recursive: true })
  await cp(path.join(rootDir, "dist-electron"), path.join(appResourcesDir, "dist-electron"), { recursive: true })
  await copyProductionNodeModules(appResourcesDir)

  const runtimePackageJson = {
    name: "metis-note",
    productName: appName,
    version,
    description: "Local-first desktop notes built with Electron, React, Tailwind, shadcn, and TipTap.",
    main: "dist-electron/index.js",
    type: "module",
  }

  await writeFile(path.join(appResourcesDir, "package.json"), JSON.stringify(runtimePackageJson, null, 2), "utf-8")

  run("plutil", ["-replace", "CFBundleDisplayName", "-string", appName, plistPath])
  run("plutil", ["-replace", "CFBundleName", "-string", appName, plistPath])
  run("plutil", ["-replace", "CFBundleIdentifier", "-string", bundleId, plistPath])
  run("plutil", ["-replace", "CFBundleShortVersionString", "-string", version, plistPath])
  run("plutil", ["-replace", "CFBundleVersion", "-string", version, plistPath])
  run("plutil", ["-replace", "LSApplicationCategoryType", "-string", "public.app-category.productivity", plistPath])
  run("codesign", ["--force", "--deep", "--sign", "-", "--timestamp=none", appBundlePath])

  const now = new Date()
  await utimes(appBundlePath, now, now)
  await utimes(appContainerDir, now, now)

  console.log(`Packaged app created at: ${appBundlePath}`)
}

await main()
