"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AdminUserCapabilities } from "@/types"
import { LIFECYCLE_ACTIONS, SOLID_VARIANT, type ConfirmedAction, type LifecycleAction } from "./lifecycle-actions"
import { LifecycleConfirmDialog } from "./LifecycleConfirmDialog"
import { useLifecycleAction } from "./useLifecycleAction"

interface Props {
  userId      : string
  targetName  : string
  status      : string
  capabilities: AdminUserCapabilities
}

const ORDER: LifecycleAction[] = ["invite", "reinstate", "reactivate", "suspend", "deactivate"]

/*
 * Each button appears only when the SERVER says this viewer may take that
 * action on this account now (capabilities: authority + status). Your own
 * account never carries lifecycle capabilities, so nothing here can be used
 * on yourself; the backend refuses it regardless.
 */
export function AccountActions({ userId, targetName, status, capabilities }: Props) {
  const { run, pending, error, clearError } = useLifecycleAction(userId)
  const [confirming, setConfirming] = useState<ConfirmedAction | null>(null)

  const available = ORDER.filter((a) => capabilities[a])
  if (available.length === 0) return null

  function start(action: LifecycleAction) {
    clearError()
    if (action === "invite") void run("invite")
    else setConfirming(action)
  }

  async function confirm(action: ConfirmedAction, reason?: string) {
    const ok = await run(action, reason ? { reason } : undefined)
    if (ok) setConfirming(null)
    return ok
  }

  return (
    <>
      {available.map((action) => {
        const spec = LIFECYCLE_ACTIONS[action]
        const Icon = spec.icon
        const label = action === "invite" && status === "invited" ? "Resend invitation" : spec.label
        return (
          <Button key={action} type="button" size="lg" className="px-4" variant={SOLID_VARIANT[spec.variant]} disabled={pending !== null} onClick={() => start(action)}>
            {pending === action && !confirming ? <Loader2 className="animate-spin" /> : <Icon />}
            {label}
          </Button>
        )
      })}

      <LifecycleConfirmDialog
        action={confirming}
        targetName={targetName}
        pending={pending !== null}
        error={confirming ? error : null}
        onCancel={() => { setConfirming(null); clearError() }}
        onConfirm={confirm}
      />
    </>
  )
}
