import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react"
import { ChevronDown, CloudCog, Download, ExternalLink, Plus, RefreshCw, Settings2, Shield, Sparkles, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SyncSettings } from "@/components/sync-settings"
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormControl, FormError, FormField, FormLabel } from "@/components/ui/form-field"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useI18n } from "@/i18n/provider"
import { cn } from "@/lib/utils"
import { useTheme } from "@/theme/provider"
import {
  LLM_PROTOCOL_ORDER,
  LLM_PROVIDER_ORDER,
  getManagedLocalModelDefinition,
  getManagedLocalModelDefinitions,
  getProtocolDefaultEndpoint,
  getProtocolLabel,
  getProviderOptions,
  getProviderPresets,
  resolveConfiguredModelName,
  type ManagedLocalModelDefinition,
  type ManagedLocalModelStatus,
  type LlmModelConfig,
  type LlmProtocolId,
  type SaveLlmModelInput,
} from "@/shared/llm"
import type { AppUpdateCheckResult, AppUpdateCurrentInfo } from "@/shared/updates"

type SettingsSection = "general" | "security" | "intelligence" | "sync"
type LocalCatalogEntry = {
  definition: ManagedLocalModelDefinition
  model: LlmModelConfig | null
}
type ManagedLocalDialogState = {
  configType: "managed-local"
  managedModelId: string
}
type ModelDialogState = SaveLlmModelInput | ManagedLocalDialogState

const defaultBuiltinProvider = LLM_PROVIDER_ORDER[0] ?? "openai"

function buildDefaultModelInput(): SaveLlmModelInput {
  const presetId = getProviderPresets(defaultBuiltinProvider)[0]?.id ?? null

  return {
    identifier: "",
    configType: "builtin",
    provider: defaultBuiltinProvider,
    presetId,
    customModelName: "",
    protocol: "openai",
    endpoint: "",
    apiKey: "",
  }
}

function buildModelInput(model: LlmModelConfig | null): SaveLlmModelInput {
  if (!model || model.configType === "managed-local") {
    return buildDefaultModelInput()
  }

  return {
    identifier: model.identifier,
    configType: model.configType,
    provider: model.provider,
    presetId: model.presetId,
    customModelName: model.customModelName ?? "",
    protocol: model.protocol,
    endpoint: model.endpoint,
    apiKey: model.apiKey,
  }
}

function buildDialogState(model: LlmModelConfig | null, localCatalogEntries: LocalCatalogEntry[]): ModelDialogState {
  if (model?.configType === "managed-local") {
    return {
      configType: "managed-local",
      managedModelId: model.managedModelId ?? localCatalogEntries[0]?.definition.id ?? "",
    }
  }

  return buildModelInput(model)
}

function isManagedLocalDialogState(form: ModelDialogState): form is ManagedLocalDialogState {
  return form.configType === "managed-local"
}

function formatGiB(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} GiB`
}

function formatBytes(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return "—"
  }

  const units = ["B", "KB", "MB", "GB", "TB"]
  let size = value
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const formatted = size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)

  return `${formatted} ${units[unitIndex]}`
}

function formatProgressPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return null
  }

  return `${Math.round(value * 100)}%`
}

function formatUpdateVersion(current: AppUpdateCurrentInfo | null) {
  if (!current) {
    return "—"
  }

  return current.releaseTag ?? `v${current.version}`
}

function isManagedLocalBusy(status: ManagedLocalModelStatus | null | undefined) {
  return status === "preparing" || status === "downloading" || status === "installing" || status === "starting"
}

function shouldRetryManagedLocalDownload(model: LlmModelConfig | null | undefined) {
  if (!model || model.configType !== "managed-local" || model.enabled || !model.managedModelId) {
    return false
  }

  return model.managedStatus !== "ready" && model.managedStatus !== "in-use"
}

function getManagedLocalStatusClasses(status: ManagedLocalModelStatus) {
  switch (status) {
    case "in-use":
      return "border-[#dce6f7] bg-[#e8f0ff] text-[#2f6ef6]"
    case "ready":
      return "border-[rgba(18,183,106,0.18)] bg-[rgba(18,183,106,0.08)] text-[rgba(2,122,72,0.96)]"
    case "preparing":
    case "downloading":
    case "installing":
    case "starting":
      return "border-[rgba(181,71,8,0.18)] bg-[rgba(181,71,8,0.08)] text-[rgba(181,71,8,0.96)]"
    case "attention":
      return "border-[rgba(180,35,24,0.16)] bg-[rgba(180,35,24,0.08)] text-[rgba(180,35,24,0.96)]"
    default:
      return "border-[#e4e7ec] bg-[#f8fafc] text-[#475467]"
  }
}

function SettingsCard({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-[#e7ebf1] bg-white px-5 py-5 dark:border-[#243041] dark:bg-[#101827]">
      <h3 className="text-base font-semibold text-[#1f2937] dark:text-slate-100">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-[#667085] dark:text-slate-400">{description}</p>
    </div>
  )
}

function SectionButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  const Icon = icon

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm font-medium transition",
        active
          ? "border-[#dce6f7] bg-[#e8f0ff] text-[#2f6ef6] dark:border-[#24416e] dark:bg-[#13233f] dark:text-[#8eb8ff]"
          : "border-transparent bg-transparent text-[#475467] hover:bg-[#f6f8fb] dark:text-slate-400 dark:hover:bg-[#111827]",
      )}
      onClick={onClick}
    >
      <span
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#eef2f7] bg-white text-[#7a8aa0]",
          active && "text-[#2f6ef6] dark:text-[#8eb8ff]",
          "dark:border-[#243041] dark:bg-[#0f172a] dark:text-slate-400",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span>{label}</span>
    </button>
  )
}

function ModelTextField({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
  tone = "default",
}: {
  label: string
  placeholder: string
  type?: "text" | "password"
  value: string
  onChange: (value: string) => void
  tone?: "default" | "soft"
}) {
  return (
    <FormField>
      <FormLabel>{label}</FormLabel>
      <FormControl tone={tone === "soft" ? "muted" : "default"}>
        <input
          className="h-full w-full border-none bg-transparent text-[15px] text-[#243444] outline-none placeholder:text-[#98a2b3] dark:text-slate-100 dark:placeholder:text-slate-500"
          placeholder={placeholder}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </FormControl>
    </FormField>
  )
}

function ModelSelectField({
  label,
  value,
  onChange,
  options,
  tone = "default",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  tone?: "default" | "soft"
}) {
  return (
    <FormField>
      <FormLabel>{label}</FormLabel>
      <FormControl className="pr-3" tone={tone === "soft" ? "muted" : "default"}>
        <select
          className="h-full w-full appearance-none border-none bg-transparent text-[15px] text-[#243444] outline-none"
          style={{
            appearance: "none",
            WebkitAppearance: "none",
            MozAppearance: "none",
            backgroundImage: "none",
          }}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none h-4 w-4 shrink-0 text-[#344054]" />
      </FormControl>
    </FormField>
  )
}

function ModelDialog({
  model,
  isOpen,
  isSubmitting,
  errorMessage,
  localCatalogEntries,
  getManagedLocalStatusLabel,
  getQualityLabel,
  onClose,
  onSubmit,
}: {
  model: LlmModelConfig | null
  isOpen: boolean
  isSubmitting: boolean
  errorMessage: string | null
  localCatalogEntries: LocalCatalogEntry[]
  getManagedLocalStatusLabel: (status: ManagedLocalModelStatus) => string
  getQualityLabel: (definition: ManagedLocalModelDefinition) => string
  onClose: () => void
  onSubmit: (payload: ModelDialogState, id?: string) => Promise<void>
}) {
  const { messages } = useI18n()
  const intelligenceMessages = messages.settings.intelligence
  const localMessages = intelligenceMessages.local
  const [form, setForm] = useState<ModelDialogState>(() => buildDialogState(model, localCatalogEntries))
  const isManagedLocal = isManagedLocalDialogState(form)
  const remoteForm = isManagedLocal ? null : form

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setForm(buildDialogState(model, localCatalogEntries))
  }, [isOpen, model?.id])

  const providerOptions = useMemo(
    () => getProviderOptions(remoteForm?.provider ?? defaultBuiltinProvider),
    [remoteForm?.provider],
  )

  const presetOptions = useMemo(() => {
    const provider = remoteForm?.provider ?? defaultBuiltinProvider
    const options = getProviderPresets(provider).map((preset) => ({
      value: preset.id,
      label: preset.label,
    }))

    if (options.length === 0 && remoteForm?.presetId) {
      return [
        {
          value: remoteForm.presetId,
          label: remoteForm.presetId,
        },
      ]
    }

    return options
  }, [remoteForm?.presetId, remoteForm?.provider])

  const configurationTypeOptions = model?.configType === "managed-local"
    ? [
        {
          value: "managed-local",
          label: intelligenceMessages.configTypeManagedLocal,
        },
      ]
    : [
        {
          value: "builtin",
          label: intelligenceMessages.configTypeBuiltin,
        },
        {
          value: "custom",
          label: intelligenceMessages.configTypeCustom,
        },
        ...(!model
          ? [
              {
                value: "managed-local",
                label: intelligenceMessages.configTypeManagedLocal,
              },
            ]
          : []),
      ]

  const localOptions = useMemo(
    () =>
      localCatalogEntries.map((entry) => ({
        value: entry.definition.id,
        label: entry.definition.displayName,
      })),
    [localCatalogEntries],
  )

  const selectedLocalEntry = useMemo(() => {
    if (!isManagedLocal) {
      return null
    }

    return localCatalogEntries.find((entry) => entry.definition.id === form.managedModelId) ?? localCatalogEntries[0] ?? null
  }, [form, isManagedLocal, localCatalogEntries])

  const selectedLocalStatus: ManagedLocalModelStatus = selectedLocalEntry?.model?.enabled
    ? "in-use"
    : selectedLocalEntry?.model?.managedStatus ?? "not-installed"
  const isSelectedLocalBusy = isManagedLocalBusy(selectedLocalStatus)
  const shouldRetrySelectedLocalDownload = shouldRetryManagedLocalDownload(selectedLocalEntry?.model)
  const localPrimaryActionLabel = selectedLocalEntry?.model
    ? selectedLocalEntry.model.enabled
      ? localMessages.inUseButton
      : isSelectedLocalBusy
        ? getManagedLocalStatusLabel(selectedLocalStatus)
        : shouldRetrySelectedLocalDownload
          ? localMessages.retryDownloadButton
          : localMessages.useNowButton
    : localMessages.addAndDownloadButton

  useEffect(() => {
    if (!remoteForm || remoteForm.configType !== "builtin") {
      return
    }

    const provider = remoteForm.provider.trim() || defaultBuiltinProvider
    const presets = getProviderPresets(provider)
    const hasCurrentPreset = presets.some((preset) => preset.id === remoteForm.presetId)
    const nextPresetId = hasCurrentPreset ? remoteForm.presetId ?? null : presets[0]?.id ?? remoteForm.presetId ?? null

    if (provider === remoteForm.provider && nextPresetId === remoteForm.presetId) {
      return
    }

    setForm((current) => {
      if (isManagedLocalDialogState(current) || current.configType !== "builtin") {
        return current
      }

      return {
        ...current,
        provider,
        presetId: nextPresetId,
      }
    })
  }, [remoteForm])

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent className="max-h-[calc(100vh-48px)] max-w-[700px]">
        <DialogHeader>
          <DialogTitle>{model ? intelligenceMessages.modal.editTitle : intelligenceMessages.modal.addTitle}</DialogTitle>
          <DialogCloseButton title={intelligenceMessages.modal.closeTitle} />
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            void onSubmit(form, model?.id)
          }}
        >
          <DialogBody>
            <div className="space-y-4">
              <ModelSelectField
                label={intelligenceMessages.modal.configurationTypeLabel}
                options={configurationTypeOptions}
                tone="soft"
                value={form.configType}
                onChange={(value) => {
                  if (value === "managed-local") {
                    setForm({
                      configType: "managed-local",
                      managedModelId: localCatalogEntries[0]?.definition.id ?? "",
                    })

                    return
                  }

                  if (value === "builtin") {
                    const provider = defaultBuiltinProvider
                    const presetId = getProviderPresets(provider)[0]?.id ?? null

                    setForm({
                      identifier: "",
                      configType: "builtin",
                      provider,
                      presetId,
                      customModelName: "",
                      protocol: "openai",
                      endpoint: "",
                      apiKey: "",
                    })

                    return
                  }

                  setForm((current) => {
                    const currentProtocol = isManagedLocalDialogState(current) ? "openai" : current.protocol ?? "openai"
                    const nextEndpoint = isManagedLocalDialogState(current)
                      ? getProtocolDefaultEndpoint("openai")
                      : current.endpoint?.trim() || getProtocolDefaultEndpoint(currentProtocol)

                    return {
                      identifier: isManagedLocalDialogState(current) ? "" : current.identifier,
                      configType: "custom",
                      provider: currentProtocol,
                      presetId: null,
                      customModelName: "",
                      protocol: currentProtocol,
                      endpoint: nextEndpoint,
                      apiKey: isManagedLocalDialogState(current) ? "" : current.apiKey ?? "",
                    }
                  })
                }}
              />

              {isManagedLocal ? (
                <>
                  <ModelSelectField
                    label={intelligenceMessages.modal.presetModelLabel}
                    options={localOptions}
                    tone="soft"
                    value={form.managedModelId}
                    onChange={(value) =>
                      setForm({
                        configType: "managed-local",
                        managedModelId: value,
                      })
                    }
                  />

                  {selectedLocalEntry ? (
                    <div className="rounded-xl border border-[#e7ebf1] bg-[#fcfdff] px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[#1f3045]">{selectedLocalEntry.definition.displayName}</div>
                          <p className="mt-1 text-sm text-[#667085]">{getQualityLabel(selectedLocalEntry.definition)}</p>
                        </div>
                        <span
                          className={cn(
                            "inline-flex shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
                            getManagedLocalStatusClasses(selectedLocalStatus),
                          )}
                        >
                          {getManagedLocalStatusLabel(selectedLocalStatus)}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-[#edf2f7] bg-white px-4 py-3">
                          <div className="text-xs font-medium uppercase tracking-[0.08em] text-[#98a2b3]">
                            {localMessages.downloadSizeLabel}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[#1f3045]">
                            {formatGiB(selectedLocalEntry.definition.estimatedDownloadSizeGiB)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-[#edf2f7] bg-white px-4 py-3">
                          <div className="text-xs font-medium uppercase tracking-[0.08em] text-[#98a2b3]">
                            {localMessages.memoryLabel}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[#1f3045]">
                            {formatGiB(selectedLocalEntry.definition.estimatedRuntimeMemoryGiB)}
                          </div>
                        </div>
                      </div>

                      {selectedLocalEntry.definition.notes[0] ? (
                        <p className="mt-4 text-sm leading-6 text-[#667085]">{selectedLocalEntry.definition.notes[0]}</p>
                      ) : null}

                      <div className="mt-4">
                        <div className="text-xs font-medium uppercase tracking-[0.08em] text-[#98a2b3]">
                          {localMessages.downloadSourcesTitle}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedLocalEntry.definition.downloadSources.map((source) => (
                            <a
                              key={`${selectedLocalEntry.definition.id}-${source.id}`}
                              className="inline-flex items-center gap-2 rounded-full border border-[#dbe4f0] bg-[#f8fbff] px-3 py-1.5 text-xs font-medium text-[#2f6ef6] transition hover:border-[#bfd3f8] hover:bg-[#edf4ff]"
                              href={source.downloadUrl}
                              rel="noreferrer"
                              target="_blank"
                              title={source.pageUrl}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span>
                                {source.label}
                                {source.communityLabel ? ` · ${source.communityLabel}` : ""}
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>

                      {selectedLocalEntry.model?.managedStatusMessage ? (
                        <p className="mt-3 text-sm leading-6 text-[#b42318]">{selectedLocalEntry.model.managedStatusMessage}</p>
                      ) : null}

                      {typeof selectedLocalEntry.model?.managedProgress === "number" && isSelectedLocalBusy ? (
                        <div className="mt-4">
                          <div className="h-2 overflow-hidden rounded-full bg-[#eef2f7]">
                            <div
                              className="h-full rounded-full bg-[#8eb6e8] transition-all"
                              style={{
                                width: `${Math.max(4, Math.round(selectedLocalEntry.model.managedProgress * 100))}%`,
                              }}
                            />
                          </div>
                          <div className="mt-2 text-xs text-[#667085]">
                            {formatBytes(selectedLocalEntry.model.managedDownloadedBytes)} /{" "}
                            {formatBytes(selectedLocalEntry.model.managedTotalBytes)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : remoteForm?.configType === "builtin" ? (
                <>
                  <ModelSelectField
                    label={intelligenceMessages.modal.providerLabel}
                    options={providerOptions}
                    tone="soft"
                    value={remoteForm.provider}
                    onChange={(value) =>
                      setForm((current) => {
                        if (isManagedLocalDialogState(current)) {
                          return current
                        }

                        return {
                          ...current,
                          provider: value,
                          presetId: getProviderPresets(value)[0]?.id ?? current.presetId ?? null,
                        }
                      })
                    }
                  />

                  <ModelSelectField
                    label={intelligenceMessages.modal.presetModelLabel}
                    options={presetOptions}
                    tone="soft"
                    value={remoteForm.presetId ?? ""}
                    onChange={(value) =>
                      setForm((current) => {
                        if (isManagedLocalDialogState(current)) {
                          return current
                        }

                        return {
                          ...current,
                          presetId: value,
                        }
                      })
                    }
                  />
                </>
              ) : (
                <>
                  <ModelSelectField
                    label={intelligenceMessages.modal.protocolLabel}
                    options={LLM_PROTOCOL_ORDER.map((protocol) => ({
                      value: protocol,
                      label: getProtocolLabel(protocol),
                    }))}
                    tone="soft"
                    value={remoteForm?.protocol ?? "openai"}
                    onChange={(value) =>
                      setForm((current) => {
                        if (isManagedLocalDialogState(current)) {
                          return current
                        }

                        const nextProtocol = value as LlmProtocolId
                        const currentEndpoint = current.endpoint?.trim() ?? ""
                        const currentDefault = getProtocolDefaultEndpoint(current.protocol ?? "openai")

                        return {
                          ...current,
                          provider: nextProtocol,
                          protocol: nextProtocol,
                          endpoint:
                            !currentEndpoint || currentEndpoint === currentDefault
                              ? getProtocolDefaultEndpoint(nextProtocol)
                              : current.endpoint,
                        }
                      })
                    }
                  />

                  <ModelTextField
                    label={intelligenceMessages.modal.endpointLabel}
                    placeholder={intelligenceMessages.modal.endpointPlaceholder}
                    value={remoteForm?.endpoint ?? ""}
                    onChange={(value) =>
                      setForm((current) =>
                        isManagedLocalDialogState(current)
                          ? current
                          : {
                              ...current,
                              endpoint: value,
                            },
                      )
                    }
                  />

                  <ModelTextField
                    label={intelligenceMessages.modal.actualModelNameLabel}
                    placeholder={intelligenceMessages.modal.actualModelNamePlaceholder}
                    value={remoteForm?.customModelName ?? ""}
                    onChange={(value) =>
                      setForm((current) =>
                        isManagedLocalDialogState(current)
                          ? current
                          : {
                              ...current,
                              customModelName: value,
                            },
                      )
                    }
                  />
                </>
              )}

              {!isManagedLocal ? (
                <>
                  <ModelTextField
                    label={intelligenceMessages.modal.modelIdentifierLabel}
                    placeholder={intelligenceMessages.modal.modelIdentifierPlaceholder}
                    tone={remoteForm?.configType === "builtin" ? "soft" : "default"}
                    value={remoteForm?.identifier ?? ""}
                    onChange={(value) =>
                      setForm((current) =>
                        isManagedLocalDialogState(current)
                          ? current
                          : {
                              ...current,
                              identifier: value,
                            },
                      )
                    }
                  />

                  <ModelTextField
                    label={intelligenceMessages.modal.apiKeyLabel}
                    placeholder={intelligenceMessages.modal.apiKeyPlaceholder}
                    type="password"
                    value={remoteForm?.apiKey ?? ""}
                    onChange={(value) =>
                      setForm((current) =>
                        isManagedLocalDialogState(current)
                          ? current
                          : {
                              ...current,
                              apiKey: value,
                            },
                      )
                    }
                  />
                </>
              ) : null}

              {errorMessage ? <FormError>{errorMessage}</FormError> : null}
            </div>
          </DialogBody>

          <DialogFooter className="border-t border-[#eef2f7]">
            <Button
              className="h-[46px] min-w-[72px] rounded-[8px] border-[#d4dbe5] bg-white px-4 text-[15px] font-medium text-[#1f3045] shadow-none hover:bg-[#f6f8fb]"
              size="default"
              variant="outline"
              type="button"
              onClick={onClose}
            >
              {intelligenceMessages.modal.cancelButton}
            </Button>
            <Button
              className="h-[46px] min-w-[96px] rounded-[8px] bg-[#8eb6e8] px-4 text-[15px] font-medium text-white shadow-none hover:-translate-y-0 hover:bg-[#80aadd]"
              size="default"
              disabled={
                isSubmitting ||
                (isManagedLocal &&
                  (!selectedLocalEntry || Boolean(selectedLocalEntry.model?.enabled) || isSelectedLocalBusy))
              }
              type="submit"
            >
              {isManagedLocal
                ? localPrimaryActionLabel
                : model
                  ? intelligenceMessages.modal.updateButton
                  : intelligenceMessages.modal.saveButton}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RowActionButton({
  disabled,
  onClick,
  children,
  danger,
}: {
  disabled?: boolean
  onClick: () => void
  children: ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "text-sm font-medium text-[#475467] transition hover:text-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50",
        danger && "text-[#667085] hover:text-[#b42318]",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function SettingsPage() {
  const { messages } = useI18n()
  const { appearance, setAppearance } = useTheme()
  const settingsMessages = messages.settings
  const intelligenceMessages = settingsMessages.intelligence
  const updateMessages = settingsMessages.general.update
  const localMessages = intelligenceMessages.local
  const [activeSection, setActiveSection] = useState<SettingsSection>("intelligence")
  const [models, setModels] = useState<LlmModelConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null)
  const [updateInfo, setUpdateInfo] = useState<AppUpdateCheckResult | null>(null)
  const [isLoadingUpdateInfo, setIsLoadingUpdateInfo] = useState(false)
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false)
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false)
  const [updateFeedback, setUpdateFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<LlmModelConfig | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [isSubmittingDialog, setIsSubmittingDialog] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ id: string; type: "enable" | "test" | "delete" } | null>(null)

  const localCatalog = useMemo(() => getManagedLocalModelDefinitions(), [])
  const managedLocalModels = useMemo(
    () => models.filter((model) => model.configType === "managed-local"),
    [models],
  )
  const localCatalogEntries = useMemo(
    () =>
      localCatalog.map((definition) => ({
        definition,
        model: managedLocalModels.find((model) => model.managedModelId === definition.id) ?? null,
      })),
    [localCatalog, managedLocalModels],
  )
  const managedLocalTaskEntries = useMemo(
    () =>
      localCatalogEntries.filter(({ model }) => {
        if (!model?.managedStatus) {
          return false
        }

        return model.managedStatus !== "ready" && model.managedStatus !== "in-use" && model.managedStatus !== "not-installed"
      }),
    [localCatalogEntries],
  )

  function getManagedLocalStatusLabel(status: ManagedLocalModelStatus) {
    switch (status) {
      case "preparing":
        return localMessages.statuses.preparing
      case "downloading":
        return localMessages.statuses.downloading
      case "installing":
        return localMessages.statuses.installing
      case "starting":
        return localMessages.statuses.starting
      case "ready":
        return localMessages.statuses.ready
      case "in-use":
        return localMessages.statuses.inUse
      case "attention":
        return localMessages.statuses.attention
      default:
        return localMessages.statuses.notInstalled
    }
  }

  function getQualityLabel(definition: ManagedLocalModelDefinition) {
    if (definition.qualityTier === "balanced") {
      return localMessages.qualityBalanced
    }

    if (definition.qualityTier === "higher-quality") {
      return localMessages.qualityHigherQuality
    }

    return definition.qualityTier
  }

  async function loadModels(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsLoading(true)
    }

    try {
      const nextModels = await window.metisNote.llmModels.list()
      setModels(nextModels)
    } catch (error) {
      if (!options?.silent) {
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : intelligenceMessages.errors.loadFailed,
        })
      }
    } finally {
      if (!options?.silent) {
        setIsLoading(false)
      }
    }
  }

  async function loadCurrentUpdateInfo() {
    setIsLoadingUpdateInfo(true)

    try {
      const current = await window.metisNote.updates.getCurrentInfo()
      setUpdateInfo((previous) => {
        if (!previous) {
          return {
            current,
            latest: null,
            updateAvailable: false,
          }
        }

        return {
          ...previous,
          current,
        }
      })
    } catch (error) {
      setUpdateFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : settingsMessages.general.update.errors.loadFailed,
      })
    } finally {
      setIsLoadingUpdateInfo(false)
    }
  }

  async function handleCheckForUpdates() {
    setIsCheckingUpdates(true)

    try {
      const result = await window.metisNote.updates.check()
      setUpdateInfo(result)
      setUpdateFeedback({
        tone: "success",
        message: result.updateAvailable && result.latest
          ? settingsMessages.general.update.notices.available(result.latest.tagName)
          : settingsMessages.general.update.notices.upToDate(formatUpdateVersion(result.current)),
      })
    } catch (error) {
      setUpdateFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : settingsMessages.general.update.errors.checkFailed,
      })
    } finally {
      setIsCheckingUpdates(false)
    }
  }

  async function handleDownloadUpdate() {
    const updateMessages = settingsMessages.general.update
    if (!updateInfo?.current.supported) {
      setUpdateFeedback({
        tone: "error",
        message: updateMessages.errors.unsupportedPlatform,
      })
      return
    }

    if (!updateInfo?.latest?.asset) {
      setUpdateFeedback({
        tone: "error",
        message: updateMessages.errors.missingAsset,
      })
      return
    }

    setIsDownloadingUpdate(true)

    try {
      const result = await window.metisNote.updates.downloadLatest()
      setUpdateFeedback({
        tone: "success",
        message: updateMessages.notices.downloaded(result.assetName),
      })
    } catch (error) {
      setUpdateFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : updateMessages.errors.downloadFailed,
      })
    } finally {
      setIsDownloadingUpdate(false)
    }
  }

  async function handleOpenReleasePage() {
    try {
      await window.metisNote.updates.openReleasePage(updateInfo?.latest?.htmlUrl)
      setUpdateFeedback({
        tone: "success",
        message: settingsMessages.general.update.notices.releaseOpened,
      })
    } catch (error) {
      setUpdateFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : settingsMessages.general.update.errors.releaseOpenFailed,
      })
    }
  }

  useEffect(() => {
    void loadModels()
  }, [])

  useEffect(() => {
    if (activeSection !== "intelligence") {
      return
    }

    const interval = window.setInterval(() => {
      void loadModels({ silent: true })
    }, 2000)

    return () => {
      window.clearInterval(interval)
    }
  }, [activeSection])

  useEffect(() => {
    if (activeSection !== "general" || updateInfo) {
      return
    }

    void loadCurrentUpdateInfo()
  }, [activeSection, updateInfo])

  async function handleSubmitRemoteModel(payload: SaveLlmModelInput, id?: string) {
    setIsSubmittingDialog(true)
    setDialogError(null)

    try {
      if (id) {
        const updated = await window.metisNote.llmModels.update(id, payload)
        setFeedback({
          tone: "success",
          message: intelligenceMessages.notices.updated(updated.identifier),
        })
      } else {
        const created = await window.metisNote.llmModels.create(payload)
        setFeedback({
          tone: "success",
          message: intelligenceMessages.notices.created(created.identifier),
        })
      }

      await loadModels()
      setIsDialogOpen(false)
      setEditingModel(null)
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : id ? intelligenceMessages.errors.updateFailed : intelligenceMessages.errors.createFailed)
    } finally {
      setIsSubmittingDialog(false)
    }
  }

  async function handleSubmitManagedLocal(modelId: string) {
    setIsSubmittingDialog(true)
    setDialogError(null)

    try {
      const existing = managedLocalModels.find((model) => model.managedModelId === modelId) ?? null

      if (shouldRetryManagedLocalDownload(existing)) {
        const retried = await window.metisNote.llmModels.addManagedLocal(modelId)
        setFeedback({
          tone: "success",
          message: intelligenceMessages.notices.localRetryStarted(resolveConfiguredModelName(retried)),
        })
      } else if (existing) {
        const enabled = await window.metisNote.llmModels.enable(existing.id)
        setFeedback({
          tone: "success",
          message: intelligenceMessages.notices.enabled(resolveConfiguredModelName(enabled)),
        })
      } else {
        const created = await window.metisNote.llmModels.addManagedLocal(modelId)
        setFeedback({
          tone: "success",
          message: intelligenceMessages.notices.localInstalled(resolveConfiguredModelName(created)),
        })
      }

      await loadModels()
      setIsDialogOpen(false)
      setEditingModel(null)
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : intelligenceMessages.errors.localAddFailed)
    } finally {
      setIsSubmittingDialog(false)
    }
  }

  async function handleSubmitModel(payload: ModelDialogState, id?: string) {
    if (payload.configType === "managed-local") {
      return handleSubmitManagedLocal(payload.managedModelId)
    }

    return handleSubmitRemoteModel(payload, id)
  }

  async function handleEnableModel(model: LlmModelConfig) {
    if (model.enabled) {
      return
    }

    setPendingAction({
      id: model.id,
      type: "enable",
    })

    try {
      const managedModelId = model.configType === "managed-local" ? model.managedModelId : null

      if (managedModelId && shouldRetryManagedLocalDownload(model)) {
        const retried = await window.metisNote.llmModels.addManagedLocal(managedModelId)
        setFeedback({
          tone: "success",
          message: intelligenceMessages.notices.localRetryStarted(resolveConfiguredModelName(retried)),
        })
      } else {
        const enabled = await window.metisNote.llmModels.enable(model.id)
        const modelLabel = enabled.configType === "managed-local" ? resolveConfiguredModelName(enabled) : enabled.identifier
        setFeedback({
          tone: "success",
          message: intelligenceMessages.notices.enabled(modelLabel),
        })
      }
      await loadModels()
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : intelligenceMessages.errors.enableFailed,
      })
    } finally {
      setPendingAction(null)
    }
  }

  async function handleTestConnection(model: LlmModelConfig) {
    setPendingAction({
      id: model.id,
      type: "test",
    })

    try {
      const result = await window.metisNote.llmModels.testConnection(model.id)
      setFeedback({
        tone: result.ok ? "success" : "error",
        message: result.message,
      })
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : intelligenceMessages.errors.testFailed,
      })
    } finally {
      setPendingAction(null)
    }
  }

  async function handleDeleteModel(model: LlmModelConfig) {
    setPendingAction({
      id: model.id,
      type: "delete",
    })

    try {
      const deleted = await window.metisNote.llmModels.delete(model.id)
      setFeedback({
        tone: "success",
        message:
          deleted.configType === "managed-local"
            ? intelligenceMessages.notices.localDeleted(resolveConfiguredModelName(deleted))
            : intelligenceMessages.notices.deleted(deleted.identifier),
      })
      await loadModels()
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : intelligenceMessages.errors.deleteFailed,
      })
    } finally {
      setPendingAction(null)
    }
  }

  const currentUpdateVersion = formatUpdateVersion(updateInfo?.current ?? null)
  const latestUpdateVersion = updateInfo?.latest?.tagName ?? updateMessages.latestVersionUnknown
  const updateStatusLabel = !updateInfo
    ? isLoadingUpdateInfo
      ? updateMessages.checkingButton
      : updateMessages.notChecked
    : !updateInfo.current.supported
      ? updateMessages.unsupported
      : updateInfo.updateAvailable
        ? updateMessages.updateAvailable
        : updateMessages.upToDate

  return (
    <>
      <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-white dark:bg-[#020817]">
        <div className="flex min-h-0 flex-1 overflow-hidden bg-white dark:bg-[#020817]">
          <aside className="w-[300px] shrink-0 border-r border-[#edf1f7] bg-white dark:border-[#1f2937] dark:bg-[#0b1220]">
            <div className="space-y-3 px-4 py-4">
              <SectionButton
                active={activeSection === "general"}
                icon={Settings2}
                label={settingsMessages.sections.general}
                onClick={() => setActiveSection("general")}
              />
              <SectionButton
                active={activeSection === "security"}
                icon={Shield}
                label={settingsMessages.sections.security}
                onClick={() => setActiveSection("security")}
              />
              <SectionButton
                active={activeSection === "intelligence"}
                icon={Sparkles}
                label={settingsMessages.sections.intelligence}
                onClick={() => setActiveSection("intelligence")}
              />
              <SectionButton
                active={activeSection === "sync"}
                icon={CloudCog}
                label={settingsMessages.sections.sync}
                onClick={() => setActiveSection("sync")}
              />
            </div>
          </aside>

          <ScrollArea className="min-h-0 flex-1 bg-white dark:bg-[#020817]">
            <div className="min-h-full px-6 py-6">
              {activeSection === "general" ? (
                <div>
                  <h1 className="text-[22px] font-semibold text-[#1f3045] dark:text-slate-100">
                    {settingsMessages.general.title}
                  </h1>
                  <div className="mt-6 grid gap-4 xl:grid-cols-2">
                    <SettingsCard
                      title={settingsMessages.general.cards.localFirstTitle}
                      description={settingsMessages.general.cards.localFirstDescription}
                    />
                    <SettingsCard
                      title={settingsMessages.general.cards.languageTitle}
                      description={settingsMessages.general.cards.languageDescription}
                    />
                    <div className="rounded-xl border border-[#e7ebf1] bg-white px-5 py-5 dark:border-[#243041] dark:bg-[#101827] xl:col-span-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-[#1f2937] dark:text-slate-100">
                            {updateMessages.title}
                          </h3>
                          <p className="mt-2 max-w-3xl text-sm leading-7 text-[#667085] dark:text-slate-400">
                            {updateMessages.description}
                          </p>
                        </div>
                        <Badge
                          className="rounded-full px-3 py-1 text-[11px] tracking-[0.04em]"
                          variant={updateInfo?.updateAvailable ? "primary" : "subtle"}
                        >
                          {updateStatusLabel}
                        </Badge>
                      </div>

                      {updateFeedback ? (
                        <div
                          className={cn(
                            "mt-4 rounded-xl border px-4 py-3 text-sm",
                            updateFeedback.tone === "success"
                              ? "border-[rgba(18,183,106,0.24)] bg-[rgba(18,183,106,0.08)] text-[rgba(2,122,72,0.96)]"
                              : "border-[rgba(180,35,24,0.2)] bg-[rgba(180,35,24,0.06)] text-[rgba(180,35,24,0.96)]",
                          )}
                        >
                          {updateFeedback.message}
                        </div>
                      ) : null}

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-[#e7ebf1] bg-[#f8fafc] px-4 py-3 dark:border-[#243041] dark:bg-[#0b1220]">
                          <div className="text-xs font-medium uppercase tracking-[0.08em] text-[#98a2b3] dark:text-slate-500">
                            {updateMessages.currentVersionLabel}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-[#1f3045] dark:text-slate-100">
                            {currentUpdateVersion}
                          </div>
                        </div>
                        <div className="rounded-xl border border-[#e7ebf1] bg-[#f8fafc] px-4 py-3 dark:border-[#243041] dark:bg-[#0b1220]">
                          <div className="text-xs font-medium uppercase tracking-[0.08em] text-[#98a2b3] dark:text-slate-500">
                            {updateMessages.latestVersionLabel}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-[#1f3045] dark:text-slate-100">
                            {latestUpdateVersion}
                          </div>
                          {updateInfo?.latest?.publishedAt ? (
                            <div className="mt-2 text-xs text-[#667085] dark:text-slate-400">
                              {updateMessages.publishedAt(new Date(updateInfo.latest.publishedAt).toLocaleString())}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          className="h-10 rounded-xl px-4 text-sm font-medium"
                          variant="outline"
                          onClick={() => {
                            void handleCheckForUpdates()
                          }}
                          disabled={isCheckingUpdates || isDownloadingUpdate}
                        >
                          <RefreshCw className={cn("h-4 w-4", isCheckingUpdates && "animate-spin")} />
                          {isCheckingUpdates ? updateMessages.checkingButton : updateMessages.checkButton}
                        </Button>
                        <Button
                          className="h-10 rounded-xl px-4 text-sm font-medium"
                          onClick={() => {
                            void handleDownloadUpdate()
                          }}
                          disabled={isCheckingUpdates || isDownloadingUpdate || !updateInfo?.latest?.asset}
                        >
                          <Download className="h-4 w-4" />
                          {isDownloadingUpdate ? updateMessages.downloadingButton : updateMessages.downloadButton}
                        </Button>
                        <Button
                          className="h-10 rounded-xl px-4 text-sm font-medium"
                          variant="ghost"
                          onClick={() => {
                            void handleOpenReleasePage()
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                          {updateMessages.openReleaseButton}
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#e7ebf1] bg-white px-5 py-5 dark:border-[#243041] dark:bg-[#101827] xl:col-span-2">
                      <h3 className="text-base font-semibold text-[#1f2937] dark:text-slate-100">
                        {settingsMessages.general.appearance.title}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-[#667085] dark:text-slate-400">
                        {settingsMessages.general.appearance.description}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {([
                          ["system", settingsMessages.general.appearance.system],
                          ["light", settingsMessages.general.appearance.light],
                          ["dark", settingsMessages.general.appearance.dark],
                        ] as const).map(([mode, label]) => (
                          <Button
                            key={mode}
                            variant={appearance === mode ? "default" : "outline"}
                            className={cn(
                              "h-10 rounded-xl px-4 text-sm font-medium",
                              appearance !== mode &&
                                "border-[#d0d5dd] text-[#475467] hover:bg-[#f8fafc] dark:border-[#243041] dark:bg-[#0f172a] dark:text-slate-300 dark:hover:bg-[#111827]",
                            )}
                            onClick={() => setAppearance(mode)}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeSection === "security" ? (
                <div>
                  <h1 className="text-[22px] font-semibold text-[#1f3045] dark:text-slate-100">
                    {settingsMessages.security.title}
                  </h1>
                  <div className="mt-6 grid gap-4 xl:grid-cols-2">
                    <SettingsCard
                      title={settingsMessages.security.cards.apiKeyTitle}
                      description={settingsMessages.security.cards.apiKeyDescription}
                    />
                    <SettingsCard
                      title={settingsMessages.security.cards.externalLinkTitle}
                      description={settingsMessages.security.cards.externalLinkDescription}
                    />
                  </div>
                </div>
              ) : null}

              {activeSection === "sync" ? (
                <SyncSettings />
              ) : null}

              {activeSection === "intelligence" ? (
                <div>
                  {feedback ? (
                    <div
                      className={cn(
                        "rounded-xl border px-4 py-3 text-sm",
                        feedback.tone === "success"
                          ? "border-[rgba(18,183,106,0.24)] bg-[rgba(18,183,106,0.08)] text-[rgba(2,122,72,0.96)]"
                          : "border-[rgba(180,35,24,0.2)] bg-[rgba(180,35,24,0.06)] text-[rgba(180,35,24,0.96)]",
                      )}
                    >
                      {feedback.message}
                    </div>
                  ) : null}

                  <div className="mt-6 overflow-hidden rounded-[1.2rem] border border-[#e7ebf1] bg-white">
                    <div className="flex items-start justify-between gap-5 border-b border-[#e7ebf1] px-5 py-4">
                      <h2 className="text-lg font-semibold text-[#1f3045]">{intelligenceMessages.remoteTitle}</h2>
                      <Button
                        className="h-11 rounded-xl border-[#e7ebf1] px-4 text-[15px] font-medium"
                        size="lg"
                        variant="outline"
                        onClick={() => {
                          setEditingModel(null)
                          setDialogError(null)
                          setIsDialogOpen(true)
                        }}
                      >
                        <Plus className="h-5 w-5" />
                        {intelligenceMessages.addRemoteModelButton}
                      </Button>
                    </div>

                    {isLoading ? (
                      <div className="px-6 py-10 text-sm text-[#667085]">{intelligenceMessages.loading}</div>
                    ) : models.length === 0 ? (
                      <div className="px-6 py-12">
                        <h3 className="text-base font-semibold text-[#1f3045]">{intelligenceMessages.remoteEmptyTitle}</h3>
                        <p className="mt-2 max-w-2xl text-sm leading-7 text-[#667085]">
                          {intelligenceMessages.remoteEmptyDescription}
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-left">
                          <thead>
                            <tr className="border-b border-[#e7ebf1] bg-[#f8fafc] text-[15px] font-semibold text-[#1f3045]">
                              <th className="px-6 py-5">{intelligenceMessages.columns.identifier}</th>
                              <th className="px-6 py-5">{intelligenceMessages.columns.configType}</th>
                              <th className="px-6 py-5">{intelligenceMessages.columns.actualModelName}</th>
                              <th className="px-6 py-5">{intelligenceMessages.columns.enabled}</th>
                              <th className="px-6 py-5">{intelligenceMessages.columns.actions}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {models.map((model) => {
                              const isPending = pendingAction?.id === model.id
                              const definition =
                                model.configType === "managed-local" ? getManagedLocalModelDefinition(model.managedModelId) : null
                              const managedStatus: ManagedLocalModelStatus | null =
                                model.configType === "managed-local"
                                  ? model.enabled
                                    ? "in-use"
                                    : model.managedStatus ?? "not-installed"
                                  : null
                              const isManagedBusy = managedStatus ? isManagedLocalBusy(managedStatus) : false
                              const configTypeLabel =
                                model.configType === "managed-local"
                                  ? intelligenceMessages.configTypeManagedLocal
                                  : model.configType === "builtin"
                                    ? intelligenceMessages.configTypeBuiltin
                                    : intelligenceMessages.configTypeCustom
                              const displayName =
                                model.configType === "managed-local" ? resolveConfiguredModelName(model) : model.identifier

                              return (
                                <tr key={model.id} className="border-b border-[#edf2f7] text-[15px] text-[#344054] last:border-b-0">
                                  <td className="px-6 py-6 font-semibold text-[#1f3045]">{displayName}</td>
                                  <td className="px-6 py-6">{configTypeLabel}</td>
                                  <td className="px-6 py-6">
                                    <div className="text-[#667085]">
                                      {model.configType === "managed-local" ? (
                                        definition ? (
                                          formatGiB(definition.estimatedDownloadSizeGiB)
                                        ) : (
                                          "—"
                                        )
                                      ) : (
                                        resolveConfiguredModelName(model)
                                      )}
                                    </div>
                                    {model.configType === "managed-local" && model.managedStatusMessage ? (
                                      <p className="mt-2 text-sm leading-6 text-[#b42318]">{model.managedStatusMessage}</p>
                                    ) : null}
                                  </td>
                                  <td className="px-6 py-6">
                                    {model.configType === "managed-local" && managedStatus ? (
                                      <span
                                        className={cn(
                                          "inline-flex rounded-full border px-3 py-1 text-xs font-medium",
                                          getManagedLocalStatusClasses(managedStatus),
                                        )}
                                      >
                                        {getManagedLocalStatusLabel(managedStatus)}
                                      </span>
                                    ) : (
                                      <Badge variant={model.enabled ? "primary" : "subtle"}>
                                        {model.enabled ? intelligenceMessages.enabledBadge : intelligenceMessages.disabledBadge}
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="px-6 py-6">
                                    <div className="flex flex-wrap items-center gap-5">
                                      <RowActionButton
                                        disabled={model.enabled || isPending || Boolean(managedStatus && isManagedBusy)}
                                        onClick={() => {
                                          void handleEnableModel(model)
                                        }}
                                      >
                                        {model.configType === "managed-local" && managedStatus
                                          ? model.enabled
                                            ? intelligenceMessages.actions.inUse
                                            : isManagedBusy
                                              ? getManagedLocalStatusLabel(managedStatus)
                                              : shouldRetryManagedLocalDownload(model)
                                                ? localMessages.retryDownloadButton
                                                : intelligenceMessages.actions.useNow
                                          : model.enabled
                                            ? intelligenceMessages.actions.enabled
                                            : intelligenceMessages.actions.enable}
                                      </RowActionButton>
                                      {model.configType !== "managed-local" ? (
                                        <>
                                          <RowActionButton
                                            disabled={isPending}
                                            onClick={() => {
                                              void handleTestConnection(model)
                                            }}
                                          >
                                            {pendingAction?.id === model.id && pendingAction.type === "test"
                                              ? intelligenceMessages.actions.testing
                                              : intelligenceMessages.actions.testConnection}
                                          </RowActionButton>
                                          <RowActionButton
                                            disabled={isPending}
                                            onClick={() => {
                                              setEditingModel(model)
                                              setDialogError(null)
                                              setIsDialogOpen(true)
                                            }}
                                          >
                                            {intelligenceMessages.actions.edit}
                                          </RowActionButton>
                                        </>
                                      ) : null}
                                      <button
                                        type="button"
                                        disabled={isPending}
                                        className="inline-flex items-center gap-2 text-sm font-medium text-[#667085] transition hover:text-[#b42318] disabled:cursor-not-allowed disabled:opacity-50"
                                        onClick={() => {
                                          void handleDeleteModel(model)
                                        }}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        <span>{intelligenceMessages.actions.delete}</span>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 rounded-[1.2rem] border border-[#e7ebf1] bg-white">
                    <div className="border-b border-[#e7ebf1] px-5 py-4">
                      <h2 className="text-lg font-semibold text-[#1f3045]">{localMessages.queueTitle}</h2>
                      <p className="mt-1 text-sm leading-6 text-[#667085]">{localMessages.queueDescription}</p>
                    </div>

                    {managedLocalTaskEntries.length === 0 ? (
                      <div className="px-5 py-6 text-sm leading-6 text-[#667085]">{localMessages.queueEmpty}</div>
                    ) : (
                      <div className="divide-y divide-[#edf2f7]">
                        {managedLocalTaskEntries.map(({ definition, model }) => {
                          const progress = model?.managedProgress ?? 0
                          const progressPercent = formatProgressPercent(progress)

                          return (
                            <div key={definition.id} className="px-5 py-5">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="text-base font-semibold text-[#1f3045]">{definition.displayName}</div>
                                  <div className="mt-1 text-sm text-[#667085]">
                                    {getQualityLabel(definition)}
                                    {" · "}
                                    {formatGiB(definition.estimatedDownloadSizeGiB)}
                                  </div>
                                </div>
                                {model?.managedStatus ? (
                                  <span
                                    className={cn(
                                      "inline-flex rounded-full border px-3 py-1 text-xs font-medium",
                                      getManagedLocalStatusClasses(model.managedStatus),
                                    )}
                                  >
                                    {getManagedLocalStatusLabel(model.managedStatus)}
                                  </span>
                                ) : null}
                              </div>

                              {typeof model?.managedProgress === "number" ? (
                                <div className="mt-4">
                                  <div className="flex items-center justify-between gap-3 text-sm text-[#667085]">
                                    <span>{localMessages.progressLabel}</span>
                                    <span>{progressPercent ?? "—"}</span>
                                  </div>
                                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eef2f7]">
                                    <div
                                      className="h-full rounded-full bg-[#8eb6e8] transition-all"
                                      style={{
                                        width: `${Math.max(4, Math.round(progress * 100))}%`,
                                      }}
                                    />
                                  </div>
                                  <div className="mt-2 text-xs text-[#667085]">
                                    {formatBytes(model.managedDownloadedBytes)} / {formatBytes(model.managedTotalBytes)}
                                  </div>
                                </div>
                              ) : (
                                <p className="mt-4 text-sm leading-6 text-[#667085]">
                                  {localMessages.queuePreparing(definition.displayName)}
                                </p>
                              )}

                              {model?.managedStatusMessage ? (
                                <p className="mt-3 text-sm leading-6 text-[#b42318]">{model.managedStatusMessage}</p>
                              ) : null}

                              <div className="mt-4">
                                <div className="text-xs font-medium uppercase tracking-[0.08em] text-[#98a2b3]">
                                  {localMessages.downloadSourcesTitle}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {definition.downloadSources.map((source) => (
                                    <a
                                      key={`${definition.id}-${source.id}`}
                                      className="inline-flex items-center gap-2 rounded-full border border-[#dbe4f0] bg-[#f8fbff] px-3 py-1.5 text-xs font-medium text-[#2f6ef6] transition hover:border-[#bfd3f8] hover:bg-[#edf4ff]"
                                      href={source.downloadUrl}
                                      rel="noreferrer"
                                      target="_blank"
                                      title={source.pageUrl}
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                      <span>
                                        {source.label}
                                        {source.communityLabel ? ` · ${source.communityLabel}` : ""}
                                      </span>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                </div>
              ) : null}
            </div>
          </ScrollArea>
        </div>
      </div>

      <ModelDialog
        errorMessage={dialogError}
        isOpen={isDialogOpen}
        isSubmitting={isSubmittingDialog}
        localCatalogEntries={localCatalogEntries}
        model={editingModel}
        onClose={() => {
          if (isSubmittingDialog) {
            return
          }

          setIsDialogOpen(false)
          setEditingModel(null)
          setDialogError(null)
        }}
        onSubmit={handleSubmitModel}
        getManagedLocalStatusLabel={getManagedLocalStatusLabel}
        getQualityLabel={getQualityLabel}
      />
    </>
  )
}
