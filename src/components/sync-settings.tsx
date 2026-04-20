import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Cloud,
  CloudCog,
  Database,
  Eye,
  EyeOff,
  FolderOpen,
  Globe,
  KeyRound,
  LockKeyhole,
  MapPin,
  Server,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormControl, FormError, FormField, FormLabel } from "@/components/ui/form-field"
import { useI18n } from "@/i18n/provider"
import { cn } from "@/lib/utils"
import type {
  BaiduPanConfig,
  GoogleDriveConfig,
  S3Config,
  SyncConfig,
  SyncProviderType,
  WebDAVConfig,
} from "@/shared/sync"
import {
  DEFAULT_BAIDU_PAN_REMOTE_PATH as BAIDU_PAN_REMOTE_PATH,
  DEFAULT_GOOGLE_DRIVE_REMOTE_PATH as GOOGLE_DRIVE_REMOTE_PATH,
} from "@/shared/sync"

function generateDeviceId(): string {
  return crypto.randomUUID()
}

function getDeviceName(): string {
  return navigator.userAgent.includes("Mac") ? "Mac" : "Desktop"
}

function getProviderIcon(provider: SyncProviderType): LucideIcon {
  switch (provider) {
    case "s3":
      return Database
    case "baidu-pan":
      return Cloud
    case "google-drive":
      return CloudCog
    case "webdav":
      return Server
  }
}

function SectionCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[1.35rem] border border-[#e7ebf1] bg-white shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-[#243041] dark:bg-[#0f172a]",
        className,
      )}
    >
      {children}
    </section>
  )
}

function SyncToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-3"
      onClick={() => onChange(!checked)}
    >
      <div className="text-left text-sm font-semibold text-[#1f3045] dark:text-slate-100">{label}</div>
      <span
        className={cn(
          "relative inline-flex h-7 w-[50px] shrink-0 items-center rounded-full border transition",
          checked
            ? "border-[#175cd3] bg-[#175cd3] dark:border-[#2563eb] dark:bg-[#2563eb]"
            : "border-[#d0d5dd] bg-[#f2f4f7] dark:border-[#334155] dark:bg-[#111827]",
        )}
      >
        <span
          className={cn(
            "absolute h-5 w-5 rounded-full bg-white shadow-[0_2px_8px_rgba(16,24,40,0.15)] transition",
            checked ? "left-[24px]" : "left-[3px]",
          )}
        />
      </span>
    </button>
  )
}

function ProviderPanelHeader({
  provider,
  title,
}: {
  provider: SyncProviderType
  title: string
}) {
  const Icon = getProviderIcon(provider)

  return (
    <div className="flex items-center gap-3 border-b border-[#eef2f7] px-3.5 py-3 dark:border-[#1f2937]">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.8rem] border border-[#dbe8ff] bg-[#eef4ff] text-[#2f6ef6] dark:border-[#24416e] dark:bg-[#13233f] dark:text-[#8eb8ff]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 text-sm font-semibold text-[#1f3045] dark:text-slate-100">{title}</div>
    </div>
  )
}

function ConfigGroup({
  icon: Icon,
  title,
  className,
  children,
}: {
  icon: LucideIcon
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("border-t border-[#eef2f7] px-3.5 py-3 first:border-t-0 dark:border-[#1f2937]", className)}>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.75rem] border border-[#e7edf6] bg-[#f8fbff] text-[#5f6f86] dark:border-[#243041] dark:bg-[#111827] dark:text-slate-300">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 text-xs font-semibold text-[#1f3045] dark:text-slate-100">{title}</div>
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  )
}

function ProviderChoiceCard({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={cn(
        "group flex min-h-[68px] w-full flex-col items-start rounded-[0.95rem] border px-3 py-2.5 text-left transition",
        active
          ? "border-[#b8d2ff] bg-[#eef4ff] shadow-[0_10px_24px_rgba(47,110,246,0.12)] dark:border-[#24416e] dark:bg-[#13233f]"
          : "border-[#d7e0eb] bg-white hover:border-[#bfd0e6] hover:bg-[#f8fbff] dark:border-[#334155] dark:bg-[#0f172a] dark:hover:bg-[#111827]",
      )}
      onClick={onClick}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <span
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.8rem] border transition",
            active
              ? "border-[#dbe8ff] bg-white text-[#2f6ef6] dark:border-[#3b5378] dark:bg-[#0f172a] dark:text-[#8eb8ff]"
              : "border-[#e7edf6] bg-[#f8fbff] text-[#7a8aa0] group-hover:text-[#5f6f86] dark:border-[#243041] dark:bg-[#111827] dark:text-slate-400",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span
          className={cn(
            "mt-1 h-3 w-3 shrink-0 rounded-full border transition",
            active
              ? "border-[#2f6ef6] bg-[#2f6ef6] shadow-[0_0_0_4px_rgba(47,110,246,0.15)] dark:border-[#8eb8ff] dark:bg-[#8eb8ff]"
              : "border-[#c8d1de] bg-white dark:border-[#475569] dark:bg-transparent",
          )}
        />
      </div>
      <div className="mt-2 text-sm font-semibold text-[#1f3045] dark:text-slate-100">{label}</div>
    </button>
  )
}

function DecoratedInputField({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = "text",
  className,
}: {
  label: string
  icon: LucideIcon
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: "text" | "password"
  className?: string
}) {
  const [revealed, setRevealed] = useState(false)
  const inputType = type === "password" && !revealed ? "password" : "text"

  return (
    <FormField className={className}>
      <FormLabel className="text-[13px] text-[#344054] dark:text-slate-300">{label}</FormLabel>
      <FormControl className="h-11 rounded-[0.95rem] border-[#d7e0eb] bg-white px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-[#334155] dark:bg-[#0f172a]">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.75rem] bg-[#f3f7fd] text-[#7a8aa0] dark:bg-[#111827] dark:text-slate-400">
          <Icon className="h-4 w-4" />
        </span>
        <input
          className="ml-2.5 h-full min-w-0 flex-1 border-none bg-transparent text-sm text-[#1f3045] outline-none placeholder:text-[#98a2b3] dark:text-slate-100 dark:placeholder:text-slate-500"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={inputType}
        />
        {type === "password" ? (
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[0.75rem] text-[#98a2b3] transition hover:bg-[#f3f7fd] hover:text-[#667085] dark:hover:bg-[#111827]"
            aria-label={revealed ? "Hide secret" : "Show secret"}
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
      </FormControl>
    </FormField>
  )
}

function ReadonlyInfoField({
  label,
  icon: Icon,
  value,
  className,
}: {
  label: string
  icon: LucideIcon
  value: string
  className?: string
}) {
  return (
    <FormField className={className}>
      <FormLabel className="text-[13px] text-[#344054] dark:text-slate-300">{label}</FormLabel>
      <FormControl
        tone="muted"
        className="h-auto min-h-[48px] items-center gap-2.5 rounded-[0.95rem] border-[#d7e0eb] px-3 py-2.5 dark:border-[#334155]"
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.75rem] bg-white text-[#7a8aa0] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:bg-[#0f172a] dark:text-slate-400">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="break-all text-sm font-medium text-[#1f3045] dark:text-slate-100">{value}</div>
        </div>
      </FormControl>
    </FormField>
  )
}

function AccountInfoCard({
  label,
  value,
  secondary,
}: {
  label: string
  value: string
  secondary?: string | null
}) {
  return (
    <div className="mt-3 rounded-[0.95rem] border border-[#dbe4f0] bg-white px-3 py-2.5 dark:border-[#334155] dark:bg-[#0f172a]">
      <div className="flex items-start gap-2.5">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.75rem] bg-[#eef4ff] text-[#2f6ef6] dark:bg-[#13233f] dark:text-[#8eb8ff]">
          <UserRound className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.08em] text-[#667085] dark:text-slate-400">{label}</div>
          <div className="mt-1 break-all text-sm font-medium text-[#1f3045] dark:text-slate-100">{value}</div>
          {secondary ? (
            <div className="mt-2 break-all text-xs leading-6 text-[#667085] dark:text-slate-400">{secondary}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function AuthorizationCard({
  authorized,
  authorizedText,
  unauthorizedText,
  accountLabel,
  accountValue,
  actionLabel,
  actionBusy,
  onAction,
}: {
  authorized: boolean
  authorizedText: string
  unauthorizedText: string
  accountLabel: string
  accountValue?: string | null
  actionLabel: string
  actionBusy: boolean
  onAction: () => void
}) {
  return (
    <div className="rounded-[0.95rem] border border-[#dbe4f0] bg-[#f8fbff] p-2.5 dark:border-[#243041] dark:bg-[#111827]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge
          className="gap-1.5 self-start rounded-full px-2.5 py-1 text-[11px] normal-case tracking-normal"
          variant={authorized ? "primary" : "subtle"}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              authorized ? "bg-[#175cd3] dark:bg-[#8eb8ff]" : "bg-[#98a2b3] dark:bg-slate-500",
            )}
          />
          {authorized ? authorizedText : unauthorizedText}
        </Badge>
      </div>

      {accountValue ? <AccountInfoCard label={accountLabel} value={accountValue} /> : null}

      <div className="mt-2.5 flex flex-wrap gap-2.5">
        <Button
          type="button"
          variant={authorized ? "outline" : "default"}
          className="h-9 rounded-[0.9rem] px-3 text-sm"
          disabled={actionBusy}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  )
}

export function SyncSettings() {
  const { messages } = useI18n()
  const syncMessages = messages.sync
  const [config, setConfig] = useState<SyncConfig | null>(null)
  const [provider, setProvider] = useState<SyncProviderType>("s3")
  const [enabled, setEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncingNow, setSyncingNow] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [s3Endpoint, setS3Endpoint] = useState("")
  const [s3Region, setS3Region] = useState("us-east-1")
  const [s3Bucket, setS3Bucket] = useState("")
  const [s3Prefix, setS3Prefix] = useState("metis-note")
  const [s3AccessKeyId, setS3AccessKeyId] = useState("")
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState("")

  const [baiduAccessToken, setBaiduAccessToken] = useState("")
  const [baiduRefreshToken, setBaiduRefreshToken] = useState("")
  const [baiduExpiresAt, setBaiduExpiresAt] = useState("")
  const [baiduAccountName, setBaiduAccountName] = useState<string | null>(null)
  const [baiduOpenId, setBaiduOpenId] = useState<string | null>(null)
  const [baiduRemotePath, setBaiduRemotePath] = useState(BAIDU_PAN_REMOTE_PATH)
  const [baiduAuthorizing, setBaiduAuthorizing] = useState(false)

  const [googleClientId, setGoogleClientId] = useState("")
  const [googleAccessToken, setGoogleAccessToken] = useState("")
  const [googleRefreshToken, setGoogleRefreshToken] = useState("")
  const [googleExpiresAt, setGoogleExpiresAt] = useState("")
  const [googleAccountEmail, setGoogleAccountEmail] = useState<string | null>(null)
  const [googleAccountName, setGoogleAccountName] = useState<string | null>(null)
  const [googleUserId, setGoogleUserId] = useState<string | null>(null)
  const [googleRemotePath, setGoogleRemotePath] = useState(GOOGLE_DRIVE_REMOTE_PATH)
  const [googleAuthorizing, setGoogleAuthorizing] = useState(false)

  const [webdavServerUrl, setWebdavServerUrl] = useState("")
  const [webdavUsername, setWebdavUsername] = useState("")
  const [webdavPassword, setWebdavPassword] = useState("")
  const [webdavRemotePath, setWebdavRemotePath] = useState("/metis-note")

  const applyConfigToForm = useCallback((nextConfig: SyncConfig | null) => {
    setProvider(nextConfig?.provider ?? "s3")
    setEnabled(nextConfig?.enabled ?? false)

    setS3Endpoint("")
    setS3Region("us-east-1")
    setS3Bucket("")
    setS3Prefix("metis-note")
    setS3AccessKeyId("")
    setS3SecretAccessKey("")

    setBaiduAccessToken("")
    setBaiduRefreshToken("")
    setBaiduExpiresAt("")
    setBaiduAccountName(null)
    setBaiduOpenId(null)
    setBaiduRemotePath(BAIDU_PAN_REMOTE_PATH)

    setGoogleClientId("")
    setGoogleAccessToken("")
    setGoogleRefreshToken("")
    setGoogleExpiresAt("")
    setGoogleAccountEmail(null)
    setGoogleAccountName(null)
    setGoogleUserId(null)
    setGoogleRemotePath(GOOGLE_DRIVE_REMOTE_PATH)

    setWebdavServerUrl("")
    setWebdavUsername("")
    setWebdavPassword("")
    setWebdavRemotePath("/metis-note")

    if (!nextConfig) {
      return
    }

    if (nextConfig.provider === "s3") {
      const s3 = nextConfig.providerConfig as S3Config
      setS3Endpoint(s3.endpoint)
      setS3Region(s3.region)
      setS3Bucket(s3.bucket)
      setS3Prefix(s3.prefix)
      setS3AccessKeyId(s3.accessKeyId)
      setS3SecretAccessKey(s3.secretAccessKey)
      return
    }

    if (nextConfig.provider === "baidu-pan") {
      const bp = nextConfig.providerConfig as BaiduPanConfig
      setBaiduAccessToken(bp.accessToken)
      setBaiduRefreshToken(bp.refreshToken)
      setBaiduExpiresAt(bp.expiresAt)
      setBaiduAccountName(bp.accountName ?? null)
      setBaiduOpenId(bp.openId ?? null)
      setBaiduRemotePath(bp.remotePath || BAIDU_PAN_REMOTE_PATH)
      return
    }

    if (nextConfig.provider === "google-drive") {
      const gd = nextConfig.providerConfig as GoogleDriveConfig
      setGoogleClientId(gd.clientId)
      setGoogleAccessToken(gd.accessToken)
      setGoogleRefreshToken(gd.refreshToken)
      setGoogleExpiresAt(gd.expiresAt)
      setGoogleAccountEmail(gd.accountEmail ?? null)
      setGoogleAccountName(gd.accountName ?? null)
      setGoogleUserId(gd.userId ?? null)
      setGoogleRemotePath(gd.remotePath || GOOGLE_DRIVE_REMOTE_PATH)
      return
    }

    const wd = nextConfig.providerConfig as WebDAVConfig
    setWebdavServerUrl(wd.serverUrl)
    setWebdavUsername(wd.username)
    setWebdavPassword(wd.password)
    setWebdavRemotePath(wd.remotePath)
  }, [])

  useEffect(() => {
    void window.metisNote.sync.getConfig().then((nextConfig) => {
      setConfig(nextConfig)
      applyConfigToForm(nextConfig)
    })
  }, [applyConfigToForm])

  const buildProviderConfig = useCallback((): S3Config | BaiduPanConfig | GoogleDriveConfig | WebDAVConfig => {
    switch (provider) {
      case "s3":
        return {
          endpoint: s3Endpoint,
          region: s3Region,
          bucket: s3Bucket,
          prefix: s3Prefix,
          accessKeyId: s3AccessKeyId,
          secretAccessKey: s3SecretAccessKey,
          forcePathStyle: false,
        }
      case "baidu-pan":
        return {
          accessToken: baiduAccessToken,
          refreshToken: baiduRefreshToken,
          expiresAt: baiduExpiresAt,
          remotePath: baiduRemotePath,
          accountName: baiduAccountName,
          openId: baiduOpenId,
        }
      case "google-drive":
        return {
          clientId: googleClientId.trim(),
          accessToken: googleAccessToken,
          refreshToken: googleRefreshToken,
          expiresAt: googleExpiresAt,
          remotePath: googleRemotePath,
          accountEmail: googleAccountEmail,
          accountName: googleAccountName,
          userId: googleUserId,
        }
      case "webdav":
        return {
          serverUrl: webdavServerUrl,
          username: webdavUsername,
          password: webdavPassword,
          remotePath: webdavRemotePath,
        }
    }
  }, [
    baiduAccessToken,
    baiduAccountName,
    baiduExpiresAt,
    baiduOpenId,
    baiduRefreshToken,
    baiduRemotePath,
    googleAccessToken,
    googleAccountEmail,
    googleAccountName,
    googleClientId,
    googleExpiresAt,
    googleRefreshToken,
    googleRemotePath,
    googleUserId,
    provider,
    s3AccessKeyId,
    s3Bucket,
    s3Endpoint,
    s3Prefix,
    s3Region,
    s3SecretAccessKey,
    webdavPassword,
    webdavRemotePath,
    webdavServerUrl,
    webdavUsername,
  ])

  const buildSyncConfig = useCallback((): SyncConfig => {
    return {
      version: 1,
      enabled,
      provider,
      providerConfig: buildProviderConfig(),
      encryption: config?.encryption ?? null,
      syncVersionHistory: config?.syncVersionHistory ?? true,
      syncInterval: config?.syncInterval ?? 300,
      assetSyncMode: config?.assetSyncMode ?? "on-demand",
      deviceId: config?.deviceId ?? generateDeviceId(),
      deviceName: config?.deviceName ?? getDeviceName(),
    }
  }, [buildProviderConfig, config, enabled, provider])

  const validateSyncConfig = useCallback((): string | null => {
    if (provider === "baidu-pan" && (!baiduAccessToken || !baiduRefreshToken)) {
      return syncMessages.baiduPan.authorizationRequiredError
    }

    if (provider === "google-drive") {
      if (!googleClientId.trim()) {
        return syncMessages.googleDrive.clientIdRequiredError
      }

      if (!googleAccessToken || !googleRefreshToken) {
        return syncMessages.googleDrive.authorizationRequiredError
      }
    }

    return null
  }, [
    baiduAccessToken,
    baiduRefreshToken,
    googleAccessToken,
    googleClientId,
    googleRefreshToken,
    provider,
    syncMessages.baiduPan.authorizationRequiredError,
    syncMessages.googleDrive.authorizationRequiredError,
    syncMessages.googleDrive.clientIdRequiredError,
  ])

  const persistConfig = useCallback(async (): Promise<SyncConfig> => {
    const validationError = validateSyncConfig()

    if (validationError) {
      throw new Error(validationError)
    }

    const nextConfig = buildSyncConfig()
    await window.metisNote.sync.configure(nextConfig)
    setConfig(nextConfig)

    return nextConfig
  }, [buildSyncConfig, validateSyncConfig])

  const handleBaiduAuthorize = useCallback(async () => {
    setSaveError(null)
    setBaiduAuthorizing(true)

    try {
      const result = await window.metisNote.sync.authorizeBaiduPan()
      setBaiduAccessToken(result.accessToken)
      setBaiduRefreshToken(result.refreshToken)
      setBaiduExpiresAt(result.expiresAt)
      setBaiduAccountName(result.accountName ?? null)
      setBaiduOpenId(result.openId ?? null)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setBaiduAuthorizing(false)
    }
  }, [])

  const handleGoogleAuthorize = useCallback(async () => {
    setSaveError(null)

    if (!googleClientId.trim()) {
      setSaveError(syncMessages.googleDrive.clientIdRequiredError)
      return
    }

    setGoogleAuthorizing(true)

    try {
      const result = await window.metisNote.sync.authorizeGoogleDrive(googleClientId.trim())
      setGoogleAccessToken(result.accessToken)
      setGoogleRefreshToken(result.refreshToken)
      setGoogleExpiresAt(result.expiresAt)
      setGoogleAccountEmail(result.accountEmail ?? null)
      setGoogleAccountName(result.accountName ?? null)
      setGoogleUserId(result.userId ?? null)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setGoogleAuthorizing(false)
    }
  }, [googleClientId, syncMessages.googleDrive.clientIdRequiredError])

  const handleSave = useCallback(async () => {
    setSaveError(null)

    setSaving(true)

    try {
      await persistConfig()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }, [persistConfig])

  const handleSyncNow = useCallback(async () => {
    setSaveError(null)
    setSyncingNow(true)

    try {
      await persistConfig()

      const result = await window.metisNote.sync.syncNow()

      if (result.status === "error") {
        setSaveError(result.error)
        return
      }

      if (result.status === "skipped") {
        setSaveError(result.reason)
        return
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSyncingNow(false)
    }
  }, [persistConfig])

  const providerOptions = useMemo(
    () => [
      {
        type: "s3" as const,
        label: syncMessages.provider.s3,
        icon: getProviderIcon("s3"),
      },
      {
        type: "baidu-pan" as const,
        label: syncMessages.provider.baiduPan,
        icon: getProviderIcon("baidu-pan"),
      },
      {
        type: "google-drive" as const,
        label: syncMessages.provider.googleDrive,
        icon: getProviderIcon("google-drive"),
      },
      {
        type: "webdav" as const,
        label: syncMessages.provider.webdav,
        icon: getProviderIcon("webdav"),
      },
    ],
    [syncMessages],
  )
  const actionsDisabled = saving || syncingNow || baiduAuthorizing || googleAuthorizing

  function renderProviderFields() {
    if (provider === "s3") {
      return (
        <>
          <ProviderPanelHeader provider={provider} title={syncMessages.provider.s3} />

          <ConfigGroup icon={Globe} title={syncMessages.groups.connection}>
            <div className="grid gap-4 md:grid-cols-2">
              <DecoratedInputField
                className="md:col-span-2"
                label={syncMessages.s3.endpointLabel}
                icon={Globe}
                value={s3Endpoint}
                onChange={setS3Endpoint}
                placeholder={syncMessages.s3.endpointPlaceholder}
              />
              <DecoratedInputField
                label={syncMessages.s3.regionLabel}
                icon={MapPin}
                value={s3Region}
                onChange={setS3Region}
              />
              <DecoratedInputField
                label={syncMessages.s3.bucketLabel}
                icon={Database}
                value={s3Bucket}
                onChange={setS3Bucket}
              />
              <DecoratedInputField
                className="md:col-span-2"
                label={syncMessages.s3.prefixLabel}
                icon={FolderOpen}
                value={s3Prefix}
                onChange={setS3Prefix}
              />
            </div>
          </ConfigGroup>

          <ConfigGroup icon={KeyRound} title={syncMessages.groups.credentials}>
            <div className="grid gap-4 md:grid-cols-2">
              <DecoratedInputField
                label={syncMessages.s3.accessKeyIdLabel}
                icon={KeyRound}
                value={s3AccessKeyId}
                onChange={setS3AccessKeyId}
              />
              <DecoratedInputField
                label={syncMessages.s3.secretAccessKeyLabel}
                icon={LockKeyhole}
                value={s3SecretAccessKey}
                onChange={setS3SecretAccessKey}
                type="password"
              />
            </div>
          </ConfigGroup>
        </>
      )
    }

    if (provider === "baidu-pan") {
      const baiduAuthorized = Boolean(baiduAccessToken && baiduRefreshToken)
      const baiduAccountValue = baiduAccountName ?? baiduOpenId

      return (
        <>
          <ProviderPanelHeader provider={provider} title={syncMessages.provider.baiduPan} />

          <ConfigGroup icon={FolderOpen} title={syncMessages.groups.syncSpace}>
            <ReadonlyInfoField
              label={syncMessages.baiduPan.remotePathLabel}
              icon={FolderOpen}
              value={baiduRemotePath}
            />
          </ConfigGroup>

          <ConfigGroup icon={ShieldCheck} title={syncMessages.groups.authorization}>
            <AuthorizationCard
              authorized={baiduAuthorized}
              authorizedText={syncMessages.baiduPan.authorizedStatus}
              unauthorizedText={syncMessages.baiduPan.unauthorizedStatus}
              accountLabel={syncMessages.baiduPan.accountLabel}
              accountValue={baiduAccountValue}
              actionLabel={
                baiduAuthorizing
                  ? syncMessages.baiduPan.authorizingAction
                  : baiduAuthorized
                    ? syncMessages.baiduPan.reauthorizeAction
                    : syncMessages.baiduPan.authorizeAction
              }
              actionBusy={baiduAuthorizing}
              onAction={() => {
                void handleBaiduAuthorize()
              }}
            />
          </ConfigGroup>
        </>
      )
    }

    if (provider === "google-drive") {
      const googleAuthorized = Boolean(googleClientId && googleAccessToken && googleRefreshToken)
      const googleAccountValue = googleAccountEmail
        ? googleAccountName
          ? `${googleAccountName} <${googleAccountEmail}>`
          : googleAccountEmail
        : googleAccountName

      return (
        <>
          <ProviderPanelHeader provider={provider} title={syncMessages.provider.googleDrive} />

          <ConfigGroup icon={KeyRound} title={syncMessages.groups.oauthConfig}>
            <div className="grid gap-4 md:grid-cols-2">
              <DecoratedInputField
                className="md:col-span-2"
                label={syncMessages.googleDrive.clientIdLabel}
                icon={KeyRound}
                value={googleClientId}
                onChange={setGoogleClientId}
                placeholder={syncMessages.googleDrive.clientIdPlaceholder}
              />
            </div>
          </ConfigGroup>

          <ConfigGroup icon={FolderOpen} title={syncMessages.groups.syncSpace}>
            <ReadonlyInfoField
              label={syncMessages.googleDrive.remotePathLabel}
              icon={FolderOpen}
              value={googleRemotePath}
            />
          </ConfigGroup>

          <ConfigGroup icon={ShieldCheck} title={syncMessages.groups.authorization}>
            <AuthorizationCard
              authorized={googleAuthorized}
              authorizedText={syncMessages.googleDrive.authorizedStatus}
              unauthorizedText={syncMessages.googleDrive.unauthorizedStatus}
              accountLabel={syncMessages.googleDrive.accountLabel}
              accountValue={googleAccountValue}
              actionLabel={
                googleAuthorizing
                  ? syncMessages.googleDrive.authorizingAction
                  : googleAuthorized
                    ? syncMessages.googleDrive.reauthorizeAction
                    : syncMessages.googleDrive.authorizeAction
              }
              actionBusy={googleAuthorizing}
              onAction={() => {
                void handleGoogleAuthorize()
              }}
            />
          </ConfigGroup>
        </>
      )
    }

    return (
      <>
        <ProviderPanelHeader provider={provider} title={syncMessages.provider.webdav} />

        <ConfigGroup icon={Globe} title={syncMessages.groups.connection}>
          <div className="grid gap-4 md:grid-cols-2">
            <DecoratedInputField
              className="md:col-span-2"
              label={syncMessages.webdav.serverUrlLabel}
              icon={Globe}
              value={webdavServerUrl}
              onChange={setWebdavServerUrl}
              placeholder={syncMessages.webdav.serverUrlPlaceholder}
            />
            <DecoratedInputField
              className="md:col-span-2"
              label={syncMessages.webdav.remotePathLabel}
              icon={FolderOpen}
              value={webdavRemotePath}
              onChange={setWebdavRemotePath}
              placeholder="/metis-note"
            />
          </div>
        </ConfigGroup>

        <ConfigGroup icon={LockKeyhole} title={syncMessages.groups.credentials}>
          <div className="grid gap-4 md:grid-cols-2">
            <DecoratedInputField
              label={syncMessages.webdav.usernameLabel}
              icon={UserRound}
              value={webdavUsername}
              onChange={setWebdavUsername}
              placeholder={syncMessages.webdav.usernamePlaceholder}
            />
            <DecoratedInputField
              label={syncMessages.webdav.passwordLabel}
              icon={LockKeyhole}
              value={webdavPassword}
              onChange={setWebdavPassword}
              type="password"
              placeholder={syncMessages.webdav.passwordPlaceholder}
            />
          </div>
        </ConfigGroup>
      </>
    )
  }

  return (
    <div>
      <h1 className="text-[22px] font-semibold text-[#1f3045] dark:text-slate-100">{syncMessages.title}</h1>

      <div className="mt-4 space-y-3">
        <SectionCard className="p-3.5">
          <SyncToggle
            checked={enabled}
            label={syncMessages.actions.enable}
            onChange={setEnabled}
          />
        </SectionCard>

        {enabled ? (
          <>
            <SectionCard className="p-3.5">
              <FormField>
                <FormLabel className="text-[13px] text-[#344054] dark:text-slate-300">
                  {syncMessages.providerLabel}
                </FormLabel>
                <div role="radiogroup" aria-label={syncMessages.providerLabel} className="mt-2.5 grid gap-2.5 md:grid-cols-2">
                  {providerOptions.map((option) => (
                    <ProviderChoiceCard
                      key={option.type}
                      icon={option.icon}
                      label={option.label}
                      active={provider === option.type}
                      onClick={() => setProvider(option.type)}
                    />
                  ))}
                </div>
              </FormField>
            </SectionCard>

            <SectionCard>{renderProviderFields()}</SectionCard>
          </>
        ) : null}

        {saveError ? <FormError>{saveError}</FormError> : null}

        <div className="flex flex-wrap justify-end gap-3">
          {enabled ? (
            <Button
              variant="outline"
              disabled={actionsDisabled}
              onClick={() => void handleSyncNow()}
            >
              {syncingNow ? syncMessages.status.syncing : syncMessages.actions.syncNow}
            </Button>
          ) : null}
          <Button disabled={actionsDisabled} onClick={() => void handleSave()}>
            {saving ? "…" : syncMessages.actions.save}
          </Button>
        </div>
      </div>
    </div>
  )
}
