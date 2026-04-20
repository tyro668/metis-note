import type { S3Config } from "../../../../../src/shared/sync"

const DEFAULT_S3_REGION = "us-east-1"

function normalizeHostname(value: string): string {
  return value.replace(/^\[|\]$/g, "").toLowerCase()
}

function isIpv4Address(value: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)
}

function isPrivateIpv4Address(value: string): boolean {
  if (!isIpv4Address(value)) {
    return false
  }

  const octets = value.split(".").map((item) => Number.parseInt(item, 10))

  if (octets.some((item) => Number.isNaN(item) || item < 0 || item > 255)) {
    return false
  }

  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  )
}

function isIpv6Address(value: string): boolean {
  return value.includes(":")
}

function shouldUsePathStyle(endpoint: string): boolean {
  if (!endpoint) {
    return false
  }

  try {
    const hostname = normalizeHostname(new URL(endpoint).hostname)

    if (!hostname) {
      return false
    }

    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      !hostname.includes(".") ||
      isIpv6Address(hostname) ||
      isPrivateIpv4Address(hostname)
    )
  } catch {
    return false
  }
}

function hasScheme(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value)
}

function looksLikeEndpoint(value: string): boolean {
  const trimmed = value.trim()

  if (!trimmed) {
    return false
  }

  return trimmed.includes("://") || trimmed.includes("/") || trimmed.includes(".") || trimmed.includes(":")
}

function normalizeEndpoint(value: string): string {
  const trimmed = value.trim()

  if (!trimmed) {
    return ""
  }

  const withScheme = hasScheme(trimmed) ? trimmed : `https://${trimmed}`

  return withScheme.replace(/\/+$/, "")
}

export function normalizeS3Config(config: Partial<S3Config>): S3Config {
  const endpointInput = config.endpoint?.trim() ?? ""
  const regionInput = config.region?.trim() ?? ""
  const shouldPromoteRegionToEndpoint = !endpointInput && looksLikeEndpoint(regionInput)
  const endpoint = normalizeEndpoint(shouldPromoteRegionToEndpoint ? regionInput : endpointInput)
  const region = shouldPromoteRegionToEndpoint || looksLikeEndpoint(regionInput)
    ? DEFAULT_S3_REGION
    : regionInput || DEFAULT_S3_REGION

  return {
    endpoint,
    region,
    bucket: config.bucket?.trim() ?? "",
    prefix: config.prefix?.trim() ?? "metis-note",
    accessKeyId: config.accessKeyId?.trim() ?? "",
    secretAccessKey: config.secretAccessKey?.trim() ?? "",
    forcePathStyle: shouldUsePathStyle(endpoint),
  }
}
