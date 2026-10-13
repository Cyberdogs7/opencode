import { usePlatform } from "@/context/platform"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Progress } from "@opencode-ai/ui/progress"
import { JSX, Show } from "solid-js"

export type LimitStatus = {
  status: "ok" | "rate-limited"
  usagePercent: number
  resetInSec: number
}

export type CombinedLimits = {
  rolling: LimitStatus
  weekly: LimitStatus
  monthly: LimitStatus
}

function formatReset(seconds: number) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return m > 0 ? `${m}m` : "<1m"
}

function UsageLimitBar(props: { label: string; usage: LimitStatus }) {
  return (
    <div class="flex flex-col gap-1">
      <div class="flex justify-between text-12-regular text-text-weak">
        <span>{props.label}</span>
        <span>{props.usage.usagePercent}%</span>
      </div>
      <Progress value={props.usage.usagePercent} maxValue={100} showValueLabel={false} hideLabel />
      <span class="text-11-regular text-text-weak">
        Resets in {formatReset(props.usage.resetInSec)}
      </span>
    </div>
  )
}

export type DialogGoUpsellProps = {
  title: string
  description: JSX.Element
  link?: string
  actionLabel: string
  limits?: CombinedLimits
  onClose?: (dontShowAgain?: boolean) => void
}

export function DialogUsageExceeded(props: DialogGoUpsellProps) {
  const dialog = useDialog()
  const platform = usePlatform()

  const runAction = () => {
    if (props.link) platform.openLink(props.link)
    props.onClose?.()
    dialog.close()
  }

  const dismiss = () => {
    props.onClose?.(true)
    dialog.close()
  }

  return (
    <Dialog title={props.title} description={props.description} fit>
      <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
        <Show when={props.limits}>
          {(limits) => (
            <div class="flex flex-col gap-3 py-2">
              <UsageLimitBar label="5 hour" usage={limits().rolling} />
              <UsageLimitBar label="1 week" usage={limits().weekly} />
              <UsageLimitBar label="1 month" usage={limits().monthly} />
            </div>
          )}
        </Show>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="large" onClick={dismiss}>
            Don't show again
          </Button>
          <Button variant="primary" size="large" onClick={runAction}>
            {props.actionLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
