import { execFile, spawn } from "node:child_process"
import { constants, createWriteStream } from "node:fs"
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { promisify } from "node:util"
import { app, shell } from "electron"
import type {
  AppUpdateCheckResult,
  AppUpdateCurrentInfo,
  AppUpdateInstallResult,
  AppUpdateReleaseInfo,
} from "../../../src/shared/updates"

type GitHubRepositoryConfig = {
  owner: string
  repo: string
}

type GitHubReleaseAsset = {
  name: string
  size: number
  browser_download_url: string
}

type GitHubRelease = {
  tag_name: string
  name: string
  html_url: string
  body: string | null
  draft: boolean
  prerelease: boolean
  published_at: string | null
  assets: GitHubReleaseAsset[]
}

type DownloadedUpdatePackage = {
  filePath: string
  assetName: string
  tagName: string
  releasePageUrl: string
}

const APP_NAME = "MetisNote"
const WINDOWS_EXECUTABLE_NAME = `${APP_NAME}.exe`
const execFileAsync = promisify(execFile)

const PLATFORM_ASSET_MATCHERS: Record<string, RegExp> = {
  darwin: /^MetisNote-macOS-.*\.zip$/i,
  win32: /^MetisNote-Windows-.*\.zip$/i,
}

function normalizeTagName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/^v/i, "")
}

async function resolveUniquePath(directoryPath: string, fileName: string) {
  const parsedPath = path.parse(fileName)
  let candidatePath = path.join(directoryPath, fileName)
  let index = 1

  while (true) {
    try {
      await access(candidatePath)
      candidatePath = path.join(directoryPath, `${parsedPath.name}-${index}${parsedPath.ext}`)
      index += 1
    } catch {
      return candidatePath
    }
  }
}

async function pathExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function isWritable(filePath: string) {
  try {
    await access(filePath, constants.W_OK)
    return true
  } catch {
    return false
  }
}

function quoteShellString(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function quotePowerShellString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function quoteAppleScriptString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

async function findFirstDirectory(
  rootDirectory: string,
  predicate: (directoryName: string, directoryPath: string) => boolean | Promise<boolean>,
  depth = 0,
): Promise<string | null> {
  if (depth > 6) {
    return null
  }

  const entries = await readdir(rootDirectory, { withFileTypes: true })
  const directories = entries.filter((entry) => entry.isDirectory())

  for (const entry of directories) {
    const directoryPath = path.join(rootDirectory, entry.name)
    if (await predicate(entry.name, directoryPath)) {
      return directoryPath
    }
  }

  for (const entry of directories) {
    const match = await findFirstDirectory(path.join(rootDirectory, entry.name), predicate, depth + 1)
    if (match) {
      return match
    }
  }

  return null
}

function resolveCurrentMacAppPath() {
  let candidatePath = process.execPath

  while (candidatePath !== path.dirname(candidatePath)) {
    if (candidatePath.endsWith(".app")) {
      return candidatePath
    }

    candidatePath = path.dirname(candidatePath)
  }

  throw new Error("Unable to locate the current macOS app bundle.")
}

async function readAppManifest() {
  return JSON.parse(await readFile(path.join(app.getAppPath(), "package.json"), "utf-8")) as {
    version: string
    metisNote?: {
      releaseTag?: string | null
      github?: GitHubRepositoryConfig
    }
  }
}

export class AppUpdaterService {
  async getCurrentInfo(): Promise<AppUpdateCurrentInfo> {
    const packageJson = await readAppManifest()

    const repository = packageJson.metisNote?.github
    if (!repository?.owner || !repository.repo) {
      throw new Error("GitHub update repository is not configured.")
    }

    return {
      version: packageJson.version,
      releaseTag: packageJson.metisNote?.releaseTag ?? null,
      platform: process.platform,
      supported: process.platform in PLATFORM_ASSET_MATCHERS,
      repositoryUrl: `https://github.com/${repository.owner}/${repository.repo}/releases`,
    }
  }

  async checkForUpdates(): Promise<AppUpdateCheckResult> {
    const current = await this.getCurrentInfo()
    if (!current.supported) {
      return {
        current,
        latest: null,
        updateAvailable: false,
      }
    }

    const repository = await this.getRepositoryConfig()
    const response = await fetch(
      `https://api.github.com/repos/${repository.owner}/${repository.repo}/releases?per_page=20`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "MetisNote",
        },
      },
    )

    if (!response.ok) {
      throw new Error(`GitHub update request failed with status ${response.status}.`)
    }

    const releases = (await response.json()) as GitHubRelease[]
    const latest = this.pickLatestReleaseForPlatform(releases)
    if (!latest) {
      return {
        current,
        latest: null,
        updateAvailable: false,
      }
    }

    const currentTag = current.releaseTag ?? `v${current.version}`
    const updateAvailable = normalizeTagName(latest.tagName) !== normalizeTagName(currentTag)

    return {
      current,
      latest,
      updateAvailable,
    }
  }

  async installLatestRelease(): Promise<AppUpdateInstallResult> {
    if (!app.isPackaged) {
      throw new Error("Automatic updates are only available for packaged app builds.")
    }

    const updateState = await this.checkForUpdates()
    if (!updateState.current.supported) {
      throw new Error("Automatic updates are not available on this platform.")
    }

    if (!updateState.updateAvailable) {
      throw new Error("This installation is already up to date.")
    }

    const stagingDirectory = await mkdtemp(path.join(os.tmpdir(), "metis-note-update-"))
    let installScheduled = false

    try {
      const downloadsDirectory = path.join(stagingDirectory, "downloads")
      const extractionDirectory = path.join(stagingDirectory, "extracted")
      await mkdir(downloadsDirectory, { recursive: true })
      await mkdir(extractionDirectory, { recursive: true })

      const downloaded = await this.downloadReleasePackage(updateState, downloadsDirectory)
      await this.extractReleasePackage(downloaded.filePath, extractionDirectory)
      await this.scheduleUpdateInstall(extractionDirectory, stagingDirectory)
      installScheduled = true

      const quitTimer = setTimeout(() => {
        app.quit()
      }, 500)
      quitTimer.unref()

      return {
        assetName: downloaded.assetName,
        tagName: downloaded.tagName,
        releasePageUrl: downloaded.releasePageUrl,
        willRestart: true,
      }
    } finally {
      if (!installScheduled) {
        await rm(stagingDirectory, { recursive: true, force: true })
      }
    }
  }

  async openReleasePage(releasePageUrl?: string) {
    const current = await this.getCurrentInfo()
    await shell.openExternal(releasePageUrl ?? current.repositoryUrl)
  }

  private async downloadReleasePackage(
    updateState: AppUpdateCheckResult,
    downloadsDirectory: string,
  ): Promise<DownloadedUpdatePackage> {
    const asset = updateState.latest?.asset
    if (!asset) {
      throw new Error("No downloadable update package is available for this platform.")
    }

    await mkdir(downloadsDirectory, { recursive: true })
    const destinationPath = await resolveUniquePath(downloadsDirectory, asset.name)

    const response = await fetch(asset.downloadUrl, {
      headers: {
        Accept: "application/octet-stream",
        "User-Agent": "MetisNote",
      },
    })

    if (!response.ok || !response.body) {
      throw new Error(`Failed to download the update package (${response.status}).`)
    }

    await pipeline(Readable.fromWeb(response.body as any), createWriteStream(destinationPath))

    return {
      filePath: destinationPath,
      assetName: asset.name,
      tagName: updateState.latest?.tagName ?? "",
      releasePageUrl: updateState.latest?.htmlUrl ?? updateState.current.repositoryUrl,
    }
  }

  private async getRepositoryConfig() {
    const manifest = await readAppManifest()
    const repository = manifest.metisNote?.github

    if (!repository?.owner || !repository.repo) {
      throw new Error("GitHub update repository is not configured.")
    }

    return repository
  }

  private pickLatestReleaseForPlatform(releases: GitHubRelease[]): AppUpdateReleaseInfo | null {
    const matcher = PLATFORM_ASSET_MATCHERS[process.platform]
    if (!matcher) {
      return null
    }

    const sortedReleases = [...releases]
      .filter((release) => !release.draft)
      .sort((left, right) => {
        const leftTime = Date.parse(left.published_at ?? "") || 0
        const rightTime = Date.parse(right.published_at ?? "") || 0

        return rightTime - leftTime
      })

    for (const release of sortedReleases) {
      const asset = release.assets.find((entry) => matcher.test(entry.name)) ?? null
      if (!asset) {
        continue
      }

      return {
        tagName: release.tag_name,
        name: release.name || release.tag_name,
        htmlUrl: release.html_url,
        body: release.body ?? "",
        prerelease: release.prerelease,
        publishedAt: release.published_at,
        asset: {
          name: asset.name,
          downloadUrl: asset.browser_download_url,
          size: asset.size,
        },
      }
    }

    return null
  }

  private async extractReleasePackage(archivePath: string, destinationPath: string) {
    if (process.platform === "darwin") {
      await execFileAsync("/usr/bin/ditto", ["-x", "-k", archivePath, destinationPath])
      return
    }

    if (process.platform === "win32") {
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath ${quotePowerShellString(
          archivePath,
        )} -DestinationPath ${quotePowerShellString(destinationPath)} -Force`,
      ])
      return
    }

    throw new Error("Automatic updates are not available on this platform.")
  }

  private async scheduleUpdateInstall(extractionDirectory: string, stagingDirectory: string) {
    if (process.platform === "darwin") {
      await this.scheduleMacInstall(extractionDirectory, stagingDirectory)
      return
    }

    if (process.platform === "win32") {
      await this.scheduleWindowsInstall(extractionDirectory, stagingDirectory)
      return
    }

    throw new Error("Automatic updates are not available on this platform.")
  }

  private async scheduleMacInstall(extractionDirectory: string, stagingDirectory: string) {
    const currentAppPath = resolveCurrentMacAppPath()
    const replacementAppPath = await findFirstDirectory(
      extractionDirectory,
      (directoryName) => directoryName === `${APP_NAME}.app`,
    )

    if (!replacementAppPath) {
      throw new Error("Downloaded update package does not contain the macOS app bundle.")
    }

    const scriptPath = path.join(stagingDirectory, "install-macos.sh")
    await writeFile(
      scriptPath,
      this.createMacInstallScript({
        currentAppPath,
        replacementAppPath,
        stagingDirectory,
      }),
      "utf-8",
    )
    await chmod(scriptPath, 0o755)

    const requiresPrivilege = !(await isWritable(currentAppPath)) || !(await isWritable(path.dirname(currentAppPath)))
    if (requiresPrivilege) {
      const command = `nohup /bin/bash ${quoteShellString(scriptPath)} >/dev/null 2>&1 &`
      await execFileAsync("/usr/bin/osascript", [
        "-e",
        `do shell script ${quoteAppleScriptString(command)} with administrator privileges`,
      ])
      return
    }

    const child = spawn("/bin/bash", [scriptPath], {
      detached: true,
      stdio: "ignore",
    })
    child.unref()
  }

  private async scheduleWindowsInstall(extractionDirectory: string, stagingDirectory: string) {
    const currentAppDirectory = path.dirname(process.execPath)
    const replacementAppDirectory =
      (await this.findExtractedWindowsAppDirectory(extractionDirectory)) ??
      (() => {
        throw new Error("Downloaded update package does not contain the Windows app executable.")
      })()

    const scriptPath = path.join(stagingDirectory, "install-windows.ps1")
    await writeFile(
      scriptPath,
      this.createWindowsInstallScript({
        currentAppDirectory,
        replacementAppDirectory,
        stagingDirectory,
      }),
      "utf-8",
    )

    const requiresPrivilege =
      !(await isWritable(currentAppDirectory)) || !(await isWritable(path.dirname(currentAppDirectory)))

    if (requiresPrivilege) {
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',${quotePowerShellString(
          scriptPath,
        )}) -Verb RunAs`,
      ])
      return
    }

    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      detached: true,
      stdio: "ignore",
    })
    child.unref()
  }

  private async findExtractedWindowsAppDirectory(extractionDirectory: string) {
    if (await pathExists(path.join(extractionDirectory, WINDOWS_EXECUTABLE_NAME))) {
      return extractionDirectory
    }

    return findFirstDirectory(extractionDirectory, async (_directoryName, directoryPath) => {
      return pathExists(path.join(directoryPath, WINDOWS_EXECUTABLE_NAME))
    })
  }

  private createMacInstallScript(options: {
    currentAppPath: string
    replacementAppPath: string
    stagingDirectory: string
  }) {
    return `#!/bin/bash
set -euo pipefail

APP_PID=${process.pid}
CURRENT_APP=${quoteShellString(options.currentAppPath)}
NEW_APP=${quoteShellString(options.replacementAppPath)}
STAGING_DIR=${quoteShellString(options.stagingDirectory)}
BACKUP_APP="\${CURRENT_APP}.previous"
LOG_FILE="\${STAGING_DIR}/install.log"

exec >> "\${LOG_FILE}" 2>&1

while kill -0 "\${APP_PID}" 2>/dev/null; do
  sleep 0.2
done
sleep 0.5

restore_previous() {
  if [ -d "\${BACKUP_APP}" ]; then
    rm -rf "\${CURRENT_APP}"
    mv "\${BACKUP_APP}" "\${CURRENT_APP}"
  fi

  if [ -d "\${CURRENT_APP}" ]; then
    /usr/bin/open "\${CURRENT_APP}" || true
  fi
}

trap 'status=$?; if [ "$status" -ne 0 ]; then restore_previous; fi; exit "$status"' EXIT

if [ ! -d "\${NEW_APP}" ]; then
  echo "Replacement app bundle was not found: \${NEW_APP}"
  exit 1
fi

rm -rf "\${BACKUP_APP}"
if [ -d "\${CURRENT_APP}" ]; then
  mv "\${CURRENT_APP}" "\${BACKUP_APP}"
fi

/usr/bin/ditto "\${NEW_APP}" "\${CURRENT_APP}"
/usr/bin/xattr -dr com.apple.quarantine "\${CURRENT_APP}" 2>/dev/null || true
/usr/bin/open "\${CURRENT_APP}" || true
rm -rf "\${BACKUP_APP}"
rm -rf "\${STAGING_DIR}"
trap - EXIT
exit 0
`
  }

  private createWindowsInstallScript(options: {
    currentAppDirectory: string
    replacementAppDirectory: string
    stagingDirectory: string
  }) {
    return `$ErrorActionPreference = 'Stop'

$AppPid = ${process.pid}
$CurrentAppDir = ${quotePowerShellString(options.currentAppDirectory)}
$NewAppDir = ${quotePowerShellString(options.replacementAppDirectory)}
$StagingDir = ${quotePowerShellString(options.stagingDirectory)}
$BackupAppDir = "$CurrentAppDir.previous"
$LogFile = Join-Path $StagingDir 'install.log'

try {
  Start-Transcript -Path $LogFile -Append | Out-Null
} catch {}

try {
  try {
    Wait-Process -Id $AppPid -ErrorAction SilentlyContinue
  } catch {}
  Start-Sleep -Milliseconds 500

  $NewExe = Join-Path $NewAppDir ${quotePowerShellString(WINDOWS_EXECUTABLE_NAME)}
  if (-not (Test-Path -LiteralPath $NewExe)) {
    throw "Replacement app executable was not found: $NewExe"
  }

  if (Test-Path -LiteralPath $BackupAppDir) {
    Remove-Item -LiteralPath $BackupAppDir -Recurse -Force
  }

  if (Test-Path -LiteralPath $CurrentAppDir) {
    Rename-Item -LiteralPath $CurrentAppDir -NewName (Split-Path -Leaf $BackupAppDir)
  }

  New-Item -ItemType Directory -Path $CurrentAppDir -Force | Out-Null
  Copy-Item -Path (Join-Path $NewAppDir '*') -Destination $CurrentAppDir -Recurse -Force

  $UpdatedExe = Join-Path $CurrentAppDir ${quotePowerShellString(WINDOWS_EXECUTABLE_NAME)}
  Start-Process -FilePath $UpdatedExe

  if (Test-Path -LiteralPath $BackupAppDir) {
    Remove-Item -LiteralPath $BackupAppDir -Recurse -Force
  }
  if (Test-Path -LiteralPath $StagingDir) {
    Remove-Item -LiteralPath $StagingDir -Recurse -Force
  }
} catch {
  if (Test-Path -LiteralPath $BackupAppDir) {
    if (Test-Path -LiteralPath $CurrentAppDir) {
      Remove-Item -LiteralPath $CurrentAppDir -Recurse -Force
    }
    Rename-Item -LiteralPath $BackupAppDir -NewName (Split-Path -Leaf $CurrentAppDir)
  }

  $FallbackExe = Join-Path $CurrentAppDir ${quotePowerShellString(WINDOWS_EXECUTABLE_NAME)}
  if (Test-Path -LiteralPath $FallbackExe) {
    Start-Process -FilePath $FallbackExe
  }

  throw
} finally {
  try {
    Stop-Transcript | Out-Null
  } catch {}
}
`
  }
}
