"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Store, Megaphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"

interface Props {
  countrySlug: string
  countryName: string
  readyForVendorOnboarding  : boolean
  readyForCustomerOperations: boolean
  /** Launch checklist satisfied (vendor category + document + vendor payout
   *  method present) — gates turning vendor-onboarding readiness ON, per the
   *  backend's pre-activation gate (see setVendorOnboardingReadiness). */
  checklistReady: boolean
  /** At least one active INBOUND (customer) payment method configured —
   *  gates turning customer-operations readiness ON (see
   *  setCustomerOperationsReadiness). */
  hasInboundPaymentMethod: boolean
  canWrite: boolean
  isGlobal: boolean
}

type Kind = "vendors" | "customers"

/**
 * Go-live milestone toggles, independent of activate/deactivate — see
 * CountryActions.tsx for the sibling activate/deactivate control and the
 * schema comment on Country.readyForVendorOnboarding for why these exist
 * separately from `status`.
 */
export function CountryReadinessActions({
  countrySlug, countryName,
  readyForVendorOnboarding, readyForCustomerOperations,
  checklistReady, hasInboundPaymentMethod, canWrite, isGlobal,
}: Props) {
  const router = useRouter()
  const [open, setOpen]       = useState<Kind | null>(null)
  const [pending, setPending] = useState<Kind | null>(null)

  if (!canWrite || !isGlobal) return null

  // Turning OFF is always allowed, active country or not — readiness is
  // meant to be undone freely (e.g. to pause onboarding without a full
  // deactivation). Turning ON is the only thing ever gated, and on the
  // launch checklist (see setVendorOnboardingReadiness), not on whether
  // the country happens to be ACTIVE — readiness is confirmed BEFORE
  // activation, not after.
  const vendorsDisabled   = readyForVendorOnboarding ? false : !checklistReady
  const customersDisabled = readyForCustomerOperations ? false : (!readyForVendorOnboarding || !hasInboundPaymentMethod)

  async function confirm(kind: Kind) {
    const turningOn = kind === "vendors" ? !readyForVendorOnboarding : !readyForCustomerOperations
    const action = kind === "vendors"
      ? (turningOn ? "ready-for-vendors" : "not-ready-for-vendors")
      : (turningOn ? "ready-for-customers" : "not-ready-for-customers")

    setPending(kind)
    try {
      const res = await fetch(`/api/countries/${countrySlug}/${action}`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        toast.success(kind === "vendors" ? "Vendor onboarding readiness updated" : "Customer operations readiness updated", {
          description: turningOn
            ? `${countryName} is now marked ready.`
            : `${countryName} is now marked not ready.`,
        })
        setOpen(null)
        router.refresh()
      } else {
        toast.error("Action failed", { description: data.message ?? "Please try again." })
      }
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setPending(null)
    }
  }

  const rows: Array<{
    kind: Kind
    icon: typeof Store
    label: string
    ready: boolean
    disabled: boolean
    disabledHint: string
    onDescription: string
    offDescription: string
  }> = [
    {
      kind: "vendors",
      icon: Store,
      label: "Vendor Onboarding",
      ready: readyForVendorOnboarding,
      disabled: vendorsDisabled,
      disabledHint: "Add a vendor category, a document, and a vendor payout method first.",
      onDescription: `Vendors will be able to complete onboarding and go live in ${countryName}.`,
      offDescription: "New vendor onboarding will be paused in this country.",
    },
    {
      kind: "customers",
      icon: Megaphone,
      label: "Customer Operations",
      ready: readyForCustomerOperations,
      disabled: customersDisabled,
      disabledHint: !readyForVendorOnboarding
        ? "Mark this country ready for vendor onboarding first."
        : "Add a customer payment method first.",
      onDescription: `It's now safe to advertise and open orders to customers in ${countryName}.`,
      offDescription: "Customer-facing operations will be paused in this country.",
    },
  ]

  return (
    <div className="admin-card space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Go-Live Readiness</h2>
        <p className="text-xs text-muted-foreground">Independent milestones — activation alone doesn't mean vendors or customers are ready.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.kind} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`icon-badge h-9 w-9 shrink-0 ${row.ready ? "icon-badge-success" : "icon-badge-neutral"}`}>
                <row.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
                <p className="text-xs text-muted-foreground">{row.ready ? "Ready" : "Not ready"}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 rounded-full"
              disabled={row.disabled}
              title={row.disabled ? row.disabledHint : undefined}
              onClick={() => setOpen(row.kind)}
            >
              {row.ready ? "Mark not ready" : "Mark ready"}
            </Button>
          </div>
        ))}
      </div>

      {rows.map((row) => (
        <AlertDialog key={row.kind} open={open === row.kind} onOpenChange={(o) => !o && setOpen(null)}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <div className={`icon-badge h-11 w-11 ${row.ready ? "icon-badge-danger" : "icon-badge-success"}`}>
                <row.icon className="h-5 w-5" />
              </div>
              <AlertDialogTitle>
                {row.ready ? "Mark not ready" : "Mark ready"} — {row.label}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {row.ready ? row.offDescription : row.onDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(null)} disabled={pending !== null}>
                Cancel
              </Button>
              <Button
                type="button"
                variant={row.ready ? "destructive" : "default"}
                className="rounded-full gap-1.5"
                disabled={pending !== null}
                onClick={() => confirm(row.kind)}
              >
                {pending === row.kind && <Loader2 className="h-4 w-4 animate-spin" />}
                {pending === row.kind ? "Saving…" : row.ready ? "Mark not ready" : "Mark ready"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ))}
    </div>
  )
}
