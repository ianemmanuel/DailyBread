"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { Ban, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getFieldError } from "@/lib/forms/form-helpers"
import { suspendVendorSchema } from "@/lib/zod/vendor"

interface Props {
  vendorId     : string
  currentStatus: string
  /** VendorUser.isBanned — ban is identity-level, not reflected in currentStatus. */
  isBanned     : boolean
  /** VENDORS_ACCOUNTS_SUSPEND */
  canSuspend   : boolean
  /** VENDORS_ACCOUNTS_REINSTATE — distinct from canSuspend; the backend checks it separately */
  canReinstate : boolean
  /** VENDORS_ACCOUNTS_BAN — also gates unban, same permission both directions */
  canBan       : boolean
}

type ActiveForm = "suspend" | "ban" | null

/**
 * VendorAccountActions — suspend / reinstate / ban / unban controls.
 * Suspend/ban require a reason before confirming. Reinstate/unban are a
 * single click (no reason required).
 */
export function VendorAccountActions({ vendorId, currentStatus, isBanned, canSuspend, canReinstate, canBan }: Props) {
    const router = useRouter()
    const [activeForm, setActive] = useState<ActiveForm>(null)
    const [isPending, startTransition] = useTransition()

    async function doReinstate() {
        startTransition(async () => {
            const res = await fetch(`/api/vendors/accounts/${vendorId}/reinstate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            })
            if (res.ok) {
                toast.success("Vendor reinstated")
                router.refresh()
            } else {
                const data = await res.json()
                toast.error("Failed to reinstate", { description: data.message })
            }
        })
    }

    async function doUnban() {
        startTransition(async () => {
            const res = await fetch(`/api/vendors/accounts/${vendorId}/unban`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            })
            if (res.ok) {
                toast.success("Vendor unbanned")
                router.refresh()
            } else {
                const data = await res.json()
                toast.error("Failed to unban", { description: data.message })
            }
        })
    }

    const reasonForm = useForm({
        defaultValues: { reason: "" } as { reason: string },
        validators   : { onSubmit: suspendVendorSchema },
        onSubmit: async ({ value }) => {
            const action = activeForm === "ban" ? "ban" : "suspend"
            const res = await fetch(`/api/vendors/accounts/${vendorId}/${action}`, {
                method : "POST",
                headers: { "Content-Type": "application/json" },
                body   : JSON.stringify({ reason: value.reason }),
        })
        if (res.ok) {
            toast.success(action === "ban" ? "Vendor banned" : "Vendor suspended")
            setActive(null)
            router.refresh()
        } else {
            const data = await res.json()
            reasonForm.setErrorMap({ onSubmit: data.message ?? "Action failed." })
        }
        },
    })

  if (!canSuspend && !canReinstate && !canBan) return null

  return (
    <div className="flex flex-col gap-3">
      {/* Action buttons */}
      {activeForm === null && (
        <div className="flex flex-wrap gap-2">
          {canSuspend && !isBanned && currentStatus === "ACTIVE" && (
            <Button size="sm" variant="outline"
              className="rounded-full border-warning/40 text-warning hover:bg-warning-bg"
              onClick={() => setActive("suspend")}>
              <ShieldAlert className="mr-2 h-4 w-4" />
              Suspend
            </Button>
          )}
          {canReinstate && !isBanned && currentStatus === "SUSPENDED" && (
            <Button size="sm" variant="outline" className="rounded-full" disabled={isPending} onClick={doReinstate}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {isPending ? "Reinstating…" : "Reinstate"}
            </Button>
          )}
          {canBan && !isBanned && (
            <Button size="sm" variant="destructive" className="rounded-full" onClick={() => setActive("ban")}>
              <Ban className="mr-2 h-4 w-4" />
              Ban
            </Button>
          )}
          {canBan && isBanned && (
            <Button size="sm" variant="outline" className="rounded-full" disabled={isPending} onClick={doUnban}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              {isPending ? "Unbanning…" : "Unban"}
            </Button>
          )}
        </div>
      )}

      {/* Reason form — shown when suspend or ban is chosen */}
      {activeForm !== null && (
        <form
          onSubmit={(e) => { e.preventDefault(); reasonForm.handleSubmit() }}
          className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive-bg p-4"
        >
          <p className="text-sm font-semibold text-destructive capitalize">
            {activeForm === "ban" ? "Ban Vendor" : "Suspend Vendor"}
          </p>

          {reasonForm.state.errorMap.onSubmit && (
            <p className="text-xs text-destructive">
              {getFieldError(reasonForm.state.errorMap.onSubmit)}
            </p>
          )}

          <reasonForm.Field
            name="reason"
            validators={{ onBlur: suspendVendorSchema.shape.reason }}
          >
            {(field) => (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="reason">
                  Reason *
                </Label>
                <Textarea
                  id="reason"
                  placeholder={
                    activeForm === "ban"
                      ? "Detailed reason for permanent ban…"
                      : "Reason for suspension…"
                  }
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  className="min-h-20 text-sm"
                />
                {field.state.meta.errors[0] && (
                  <p className="text-xs text-destructive">{getFieldError(field.state.meta.errors[0])}</p>
                )}
              </div>
            )}
          </reasonForm.Field>

          <reasonForm.Subscribe selector={(s) => ({ isSubmitting: s.isSubmitting })}>
            {({ isSubmitting }) => (
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" className="rounded-full" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Confirming…" : `Confirm ${activeForm === "ban" ? "Ban" : "Suspend"}`}
                </Button>
                <Button size="sm" variant="ghost" className="rounded-full" type="button" onClick={() => setActive(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </reasonForm.Subscribe>
        </form>
      )}
    </div>
  )
}