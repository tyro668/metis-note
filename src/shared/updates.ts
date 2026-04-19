export interface AppUpdateCurrentInfo {
  version: string
  releaseTag: string | null
  platform: string
  supported: boolean
  repositoryUrl: string
}

export interface AppUpdateAssetInfo {
  name: string
  downloadUrl: string
  size: number
}

export interface AppUpdateReleaseInfo {
  tagName: string
  name: string
  htmlUrl: string
  body: string
  prerelease: boolean
  publishedAt: string | null
  asset: AppUpdateAssetInfo | null
}

export interface AppUpdateCheckResult {
  current: AppUpdateCurrentInfo
  latest: AppUpdateReleaseInfo | null
  updateAvailable: boolean
}

export interface AppUpdateDownloadResult {
  filePath: string
  assetName: string
  tagName: string
  releasePageUrl: string
}
