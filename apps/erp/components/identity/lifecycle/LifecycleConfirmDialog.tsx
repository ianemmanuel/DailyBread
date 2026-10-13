"use client"

import { useEffect, useId, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { LIFECYCLE_ACTIONS, MIN_REASON_LENGTH, SOLID_VARIANT, type ConfirmedAction } from "./lifecycle-actions"

interface Props {
  action     : ConfirmedAction | null
  targetName : string
  pending    : boolean
  error      : string | null
  onCancel   : () => void
  /** Resolves true once the backend accepted the action; the dialog closes only then. */
  onConfirm  : (action: ConfirmedAction, reason?: string) => Promise<boolean>
}

export function LifecycleConfirmDialog({ action, targetName, pending, error, onCancel, onConfirm }: Props) {
  const reasonId = useId()
  const [reason, setReason] = useState("")
  useEffect(() => { setReason("") }, [action])

  const spec    = action ? LIFECYCLE_ACTIONS[action] : null
  const confirm = spec?.confirm
  const Icon    = spec?.icon
  const reasonMissing = Boolean(confirm?.reason) && reason.trim().length < MIN_REASON_LENGTH

  async function submit() {
    if (!action || reasonMissing) return
    const ok = await onConfirm(action, confirm?.reason ? reason.trim() : undefined)
    if (ok) setReason("")
  }

  return (
    <AlertDialog open={action !== null} onOpenChange={(open) => { if (!open && !pending) onCancel() }}>
      {spec && confirm && Icon && (
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className={`icon-badge h-11 w-11 ${spec.variant === "destructive" ? "icon-badge-danger" : spec.variant === "success" ? "icon-badge-success" : "icon-badge-warning"}`}>
              <Icon className="h-5 w-5" />
            </div>
            <AlertDialogTitle>{confirm.title(targetName)}</AlertDialogTitle>
            <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
          </AlertDialogHeader>

          {confirm.reason && (
            <div className="space-y-1.5">
              <Label htmlFor={reasonId} className="text-xs">{confirm.reason.label}</Label>
              <Textarea
                id={reasonId}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={confirm.reason.placeholder}
                disabled={pending}
                className="min-h-20 text-sm"
                aria-describedby={`${reasonId}-hint`}
              />
              <p id={`${reasonId}-hint`} className="text-xs text-muted-foreground">
                Recorded in the audit trail. At least {MIN_REASON_LENGTH} characters.
              </p>
            </div>
          )}

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
            <Button type="button" variant={SOLID_VARIANT[spec.variant]} onClick={submit} disabled={pending || reasonMissing}>
              {pending && <Loader2 className="animate-spin" />}
              {pending ? confirm.pendingLabel : confirm.confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}
