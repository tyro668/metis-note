import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { execFileSync } from "node:child_process"

export const appName = "MetisNote"
export const bundleId = "com.metisnote.app"

export function run(rootDir, command, args) {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
  })
}

function read(rootDir, command, args) {
  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
  })
}

export async function readPackageVersion(rootDir) {
  const packageJson = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf-8"))
  return packageJson.version
}

export async function copyProductionNodeModules(rootDir, appResourcesDir) {
  const packagePaths = [...new Set(read(rootDir, "npm", ["ls", "--omit=dev", "--all", "--parseable"]).split(/\r?\n/).filter(Boolean))]

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

export async function writeRuntimePackageJson(appResourcesDir, version) {
  const runtimePackageJson = {
    name: "metis-note",
    productName: appName,
    version,
    description: "Local-first desktop notes built with Electron, React, Tailwind, shadcn, and TipTap.",
    main: "dist-electron/index.js",
    type: "module",
  }

  await writeFile(path.join(appResourcesDir, "package.json"), JSON.stringify(runtimePackageJson, null, 2), "utf-8")
}

export async function copyAppPayload(rootDir, appResourcesDir, version) {
  await mkdir(appResourcesDir, { recursive: true })
  await cp(path.join(rootDir, "dist"), path.join(appResourcesDir, "dist"), { recursive: true })
  await cp(path.join(rootDir, "dist-electron"), path.join(appResourcesDir, "dist-electron"), { recursive: true })
  await copyProductionNodeModules(rootDir, appResourcesDir)
  await writeRuntimePackageJson(appResourcesDir, version)
}
