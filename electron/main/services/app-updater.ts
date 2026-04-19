import { createWriteStream } from "node:fs"
import { access, mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { app, shell } from "electron"
import type {
  AppUpdateCheckResult,
  AppUpdateCurrentInfo,
  AppUpdateDownloadResult,
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

  async downloadLatestRelease(): Promise<AppUpdateDownloadResult> {
    const updateState = await this.checkForUpdates()
    const asset = updateState.latest?.asset
    if (!asset) {
      throw new Error("No downloadable update package is available for this platform.")
    }

    const downloadsDirectory = path.join(app.getPath("downloads"), "MetisNote", "updates")
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
    shell.showItemInFolder(destinationPath)

    return {
      filePath: destinationPath,
      assetName: asset.name,
      tagName: updateState.latest?.tagName ?? "",
      releasePageUrl: updateState.latest?.htmlUrl ?? updateState.current.repositoryUrl,
    }
  }

  async openReleasePage(releasePageUrl?: string) {
    const current = await this.getCurrentInfo()
    await shell.openExternal(releasePageUrl ?? current.repositoryUrl)
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
}
