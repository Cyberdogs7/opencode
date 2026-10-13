import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Progress } from "@opencode-ai/ui/progress"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Tag } from "@opencode-ai/ui/tag"
import { showToast } from "@/utils/toast"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import { createMemo, createResource, type Component, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { DialogConnectProvider, useProviderConnectController } from "./dialog-connect-provider"
import { DialogCustomProvider } from "./dialog-custom-provider"
import { SettingsList } from "./settings-list"
import { SettingsServerPicker, SettingsServerScope } from "./settings-server-picker"

function formatReset(seconds: number) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return m > 0 ? `${m}m` : "<1m"
}

function LiteUsageBar(props: { label: string; usage: { usagePercent: number; resetInSec: number } }) {
  return (
    <div class="flex flex-col gap-1">
      <div class="flex justify-between text-12-regular text-text-weak">
        <span>{props.label}</span>
        <span>{props.usage.usagePercent}%</span>
      </div>
      <Progress value={props.usage.usagePercent} maxValue={100} showValueLabel={false} hideLabel />
      <span class="text-11-regular text-text-weak">Resets in {formatReset(props.usage.resetInSec)}</span>
    </div>
  )
}

function LiteUsageSection() {
  const serverSdk = useServerSDK()
  const [usage] = createResource(() =>
    serverSdk().client
      .get({ url: "/experimental/usage/lite" })
      .then((r: unknown) => r as { rolling: { usagePercent: number; resetInSec: number }; weekly: { usagePercent: number; resetInSec: number }; monthly: { usagePercent: number; resetInSec: number } }),
  )
  return (
    <Show when={usage()}>
      {(data) => (
        <div class="flex flex-col gap-3 py-2 px-1">
          <h4 class="text-13-medium text-text-strong">Go Usage Limits</h4>
          <LiteUsageBar label="5 hour" usage={data().rolling} />
          <LiteUsageBar label="1 week" usage={data().weekly} />
          <LiteUsageBar label="1 month" usage={data().monthly} />
        </div>
      )}
    </Show>
  )
}

type ProviderSource = "env" | "api" | "config" | "custom"
type ProviderItem = ReturnType<ReturnType<typeof useProviders>["connected"]>[number]

const PROVIDER_NOTES = [
  { match: (id: string) => id === "opencode", key: "dialog.provider.opencode.note" },
  { match: (id: string) => id === "opencode-go", key: "dialog.provider.opencodeGo.tagline" },
  { match: (id: string) => id === "anthropic", key: "dialog.provider.anthropic.note" },
  { match: (id: string) => id.startsWith("github-copilot"), key: "dialog.provider.copilot.note" },
  { match: (id: string) => id === "openai", key: "dialog.provider.openai.note" },
  { match: (id: string) => id === "google", key: "dialog.provider.google.note" },
  { match: (id: string) => id === "openrouter", key: "dialog.provider.openrouter.note" },
  { match: (id: string) => id === "vercel", key: "dialog.provider.vercel.note" },
] as const

export const SettingsProviders: Component<{ onBack?: () => void }> = (props) => {
  return (
    <SettingsServerScope>
      <SettingsProvidersContent onBack={props.onBack} />
    </SettingsServerScope>
  )
}

const SettingsProvidersContent: Component<{ onBack?: () => void }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const providers = useProviders()
  const providerConnect = useProviderConnectController({ onBack: props.onBack })

  const connect = (provider?: string) => {
    providerConnect.select(provider)
    void dialog.show(() => <DialogConnectProvider controller={providerConnect} />)
  }

  const connected = createMemo(() => {
    return providers
      .connected()
      .filter((p) => p.id !== "opencode" || Object.values(p.models).find((m) => m.cost?.input))
  })

  const popular = createMemo(() => {
    const connectedIDs = new Set(connected().map((p) => p.id))
    const items = providers
      .popular()
      .filter((p) => !connectedIDs.has(p.id))
      .slice()
    items.sort((a, b) => popularProviders.indexOf(a.id) - popularProviders.indexOf(b.id))
    return items
  })

  const source = (item: ProviderItem): ProviderSource | undefined => {
    if (!("source" in item)) return
    const value = item.source
    if (value === "env" || value === "api" || value === "config" || value === "custom") return value
    return
  }

  const type = (item: ProviderItem) => {
    const current = source(item)
    if (current === "env") return language.t("settings.providers.tag.environment")
    if (current === "api") return language.t("provider.connect.method.apiKey")
    if (current === "config") {
      if (isConfigCustom(item.id)) return language.t("settings.providers.tag.custom")
      return language.t("settings.providers.tag.config")
    }
    if (current === "custom") return language.t("settings.providers.tag.custom")
    return language.t("settings.providers.tag.other")
  }

  const canDisconnect = (item: ProviderItem) => source(item) !== "env"

  const note = (id: string) => PROVIDER_NOTES.find((item) => item.match(id))?.key

  const isConfigCustom = (providerID: string) => {
    const provider = serverSync().data.config.provider?.[providerID]
    if (!provider) return false
    if (provider.npm !== "@ai-sdk/openai-compatible") return false
    if (!provider.models || Object.keys(provider.models).length === 0) return false
    return true
  }

  const disableProvider = async (providerID: string, name: string) => {
    const before = serverSync().data.config.disabled_providers ?? []
    const next = before.includes(providerID) ? before : [...before, providerID]
    serverSync().set("config", "disabled_providers", next)

    await serverSync()
      .updateConfig({ disabled_providers: next })
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.disconnect.toast.disconnected.title", { provider: name }),
          description: language.t("provider.disconnect.toast.disconnected.description", { provider: name }),
        })
      })
      .catch((err: unknown) => {
        serverSync().set("config", "disabled_providers", before)
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  const disconnect = async (providerID: string, name: string) => {
    if (isConfigCustom(providerID)) {
      await serverSDK()
        .client.auth.remove({ providerID })
        .catch(() => undefined)
      await disableProvider(providerID, name)
      return
    }
    await serverSDK()
      .client.auth.remove({ providerID })
      .then(async () => {
        await serverSDK().client.global.dispose()
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.disconnect.toast.disconnected.title", { provider: name }),
          description: language.t("provider.disconnect.toast.disconnected.description", { provider: name }),
        })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex items-center justify-between gap-4 pt-6 pb-8 max-w-[720px]">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.providers.title")}</h2>
          <SettingsServerPicker />
        </div>
      </div>

      <div class="flex flex-col gap-8 max-w-[720px]">
        <div class="flex flex-col gap-1" data-component="connected-providers-section">
          <h3 class="text-14-medium text-text-strong pb-2">{language.t("settings.providers.section.connected")}</h3>
          <SettingsList>
            <Show
              when={connected().length > 0}
              fallback={
                <div class="py-4 text-14-regular text-text-weak">
                  {language.t("settings.providers.connected.empty")}
                </div>
              }
            >
              <For each={connected()}>
                {(item) => (
                  <div>
                    <div class="group flex flex-wrap items-center justify-between gap-4 min-h-16 py-3 border-b border-border-weak-base last:border-none">
                      <div class="flex items-center gap-3 min-w-0">
                        <ProviderIcon id={item.id} class="size-5 shrink-0 icon-strong-base" />
                        <span class="text-14-medium text-text-strong truncate">{item.name}</span>
                        <Tag>{type(item)}</Tag>
                      </div>
                      <Show
                        when={canDisconnect(item)}
                        fallback={
                          <span class="text-14-regular text-text-base opacity-0 group-hover:opacity-100 transition-opacity duration-200 pr-3 cursor-default">
                            {language.t("settings.providers.connected.environmentDescription")}
                          </span>
                        }
                      >
                        <Button size="large" variant="ghost" onClick={() => void disconnect(item.id, item.name)}>
                          {language.t("common.disconnect")}
                        </Button>
                      </Show>
                    </div>
                    <Show when={item.id === "opencode-go"}>
                      <div class="pl-8 pb-2">
                        <LiteUsageSection />
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </SettingsList>
        </div>

        <div class="flex flex-col gap-1">
          <h3 class="text-14-medium text-text-strong pb-2">{language.t("settings.providers.section.popular")}</h3>
          <SettingsList>
            <For each={popular()}>
              {(item) => (
                <div class="flex flex-wrap items-center justify-between gap-4 min-h-16 py-3 border-b border-border-weak-base last:border-none">
                  <div class="flex flex-col min-w-0">
                    <div class="flex items-center gap-x-3">
                      <ProviderIcon id={item.id} class="size-5 shrink-0 icon-strong-base" />
                      <span class="text-14-medium text-text-strong">{item.name}</span>
                      <Show when={item.id === "opencode"}>
                        <Tag>{language.t("dialog.provider.tag.recommended")}</Tag>
                      </Show>
                      <Show when={item.id === "opencode-go"}>
                        <Tag>{language.t("dialog.provider.tag.recommended")}</Tag>
                      </Show>
                    </div>
                    <Show when={note(item.id)}>
                      {(key) => <span class="text-12-regular text-text-weak pl-8">{language.t(key())}</span>}
                    </Show>
                  </div>
                  <Button size="large" variant="secondary" icon="plus-small" onClick={() => connect(item.id)}>
                    {language.t("common.connect")}
                  </Button>
                </div>
              )}
            </For>

            <div
              class="flex items-center justify-between gap-4 min-h-16 border-b border-border-weak-base last:border-none flex-wrap py-3"
              data-component="custom-provider-section"
            >
              <div class="flex flex-col min-w-0">
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ProviderIcon id="synthetic" class="size-5 shrink-0 icon-strong-base" />
                  <span class="text-14-medium text-text-strong">{language.t("provider.custom.title")}</span>
                  <Tag>{language.t("settings.providers.tag.custom")}</Tag>
                </div>
                <span class="text-12-regular text-text-weak pl-8">
                  {language.t("settings.providers.custom.description")}
                </span>
              </div>
              <Button
                size="large"
                variant="secondary"
                icon="plus-small"
                onClick={() => {
                  dialog.show(() => <DialogCustomProvider onBack={dialog.close} />)
                }}
              >
                {language.t("common.connect")}
              </Button>
            </div>
          </SettingsList>

          <Button
            variant="ghost"
            class="px-0 py-0 mt-5 text-14-medium text-text-interactive-base text-left justify-start hover:bg-transparent active:bg-transparent"
            onClick={() => connect()}
          >
            {language.t("dialog.provider.viewAll")}
          </Button>
        </div>
      </div>
    </div>
  )
}
