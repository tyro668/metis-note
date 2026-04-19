import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { execFileSync, spawnSync } from "node:child_process"

export const appName = "MetisNote"
export const bundleId = "com.metisnote.app"
const runtimeExternalModules = ["node-llama-cpp"]
const require = createRequire(import.meta.url)

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

export async function copyDirectory(sourcePath, destinationPath) {
  if (process.platform === "win32") {
    await mkdir(destinationPath, { recursive: true })
    const result = spawnSync(
      "robocopy",
      [
        sourcePath,
        destinationPath,
        "/E",
        "/NFL",
        "/NDL",
        "/NJH",
        "/NJS",
        "/NC",
        "/NS",
        "/NP",
      ],
      { stdio: "inherit" },
    )

    const status = result.status ?? 1
    if (status > 7) {
      throw new Error(`robocopy failed with exit code ${status}`)
    }

    return
  }

  await cp(sourcePath, destinationPath, { recursive: true })
}

function resolveInstalledPackageDir(packageName, fromPath) {
  const entryPath = require.resolve(packageName, {
    paths: [fromPath],
  })

  let currentPath = path.dirname(entryPath)
  while (true) {
    if (existsSync(path.join(currentPath, "package.json"))) {
      return currentPath
    }

    const parentPath = path.dirname(currentPath)
    if (parentPath === currentPath) {
      throw new Error(`Unable to locate package root for ${packageName}.`)
    }
    currentPath = parentPath
  }
}

export async function readPackageVersion(rootDir) {
  const packageJson = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf-8"))
  return packageJson.version
}

export async function copyProductionNodeModules(rootDir, appResourcesDir) {
  const nodeModulesRoot = path.join(rootDir, "node_modules")
  const queue = runtimeExternalModules.map((packageName) => resolveInstalledPackageDir(packageName, rootDir))
  const visited = new Set()

  while (queue.length > 0) {
    const packagePath = queue.shift()
    if (!packagePath || visited.has(packagePath)) {
      continue
    }
    visited.add(packagePath)

    const relativePath = path.relative(nodeModulesRoot, packagePath)
    if (!relativePath || relativePath.startsWith("..")) {
      continue
    }

    const destinationPath = path.join(appResourcesDir, "node_modules", relativePath)
    await mkdir(path.dirname(destinationPath), { recursive: true })
    await copyDirectory(packagePath, destinationPath)

    const packageJson = JSON.parse(await readFile(path.join(packagePath, "package.json"), "utf-8"))
    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.optionalDependencies ?? {}),
    ]

    for (const dependencyName of dependencyNames) {
      try {
        queue.push(resolveInstalledPackageDir(dependencyName, packagePath))
      } catch {
        if (!(dependencyName in (packageJson.optionalDependencies ?? {}))) {
          throw new Error(`Missing runtime dependency "${dependencyName}" required by ${packageJson.name}.`)
        }
      }
    }
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
  await copyDirectory(path.join(rootDir, "dist"), path.join(appResourcesDir, "dist"))
  await copyDirectory(path.join(rootDir, "dist-electron"), path.join(appResourcesDir, "dist-electron"))
  await copyProductionNodeModules(rootDir, appResourcesDir)
  await writeRuntimePackageJson(appResourcesDir, version)
}
