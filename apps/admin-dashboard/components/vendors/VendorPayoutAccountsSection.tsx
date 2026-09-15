"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, ShieldCheck, ShieldX, Landmark, Star, AlertTriangle, PauseCircle, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import { EmptyState } from "@/components/shared/EmptyState"
import type { VendorPayoutAccount, PayoutRiskFlag, PayoutHoldStatus } from "@/types"

interface Props {
  vendorId  : string
  accounts  : VendorPayoutAccount[]
  canManage : boolean
  holdStatus?: PayoutHoldStatus
  holdReason?: string | null
}

const STATUS_BADGE: Record<VendorPayoutAccount["verificationStatus"], string> = {
  VERIFIED       : "badge-success",
  PENDING        : "badge-warning",
  REQUIRES_REVIEW: "badge-warning",
  FAILED         : "badge-danger",
}
const STATUS_LABEL: Record<VendorPayoutAccount["verificationStatus"], string> = {
  VERIFIED       : "Verified",
  PENDING        : "Pending",
  REQUIRES_REVIEW: "Requires review",
  FAILED         : "Failed",
}

const RISK_LABEL: Record<PayoutRiskFlag, string> = {
  NAME_MISMATCH       : "Name doesn't match vendor",
  ADD_VELOCITY        : "Many accounts added recently",
  DUPLICATE_IDENTIFIER: "Identifier used by another vendor",
}

// Vendor 1D — how this account reached its current verificationStatus.
// FORMAT_CHECKS/MANUAL predate Vendor 1D; FINANCE_BANK_RESOLUTION is the
// new automatic path (finance-bank.provider.ts). Unrecognised/null falls
// back to the raw method string so a future provider name isn't hidden.
const METHOD_LABEL: Record<string, string> = {
  FINANCE_BANK_RESOLUTION: "Verified automatically",
  MANUAL                 : "Reviewed by an admin",
  FORMAT_CHECKS           : "Structural check only",
}

function methodLabel(method: string | null): string | null {
  if (!method) return null
  return METHOD_LABEL[method] ?? method
}

function accountIdentifier(a: VendorPayoutAccount): string {
  if (a.masked?.accountNumber) return `${a.bankName ?? "Bank"} ${a.masked.accountNumber}`
  if (a.masked?.iban) return `IBAN ${a.masked.iban}`
  if (a.masked?.mobileNumber) return `${a.mobileNetwork ?? "Mobile money"} — ${a.masked.mobileNumber}`
  if (a.paypalEmail) return `PayPal — ${a.paypalEmail}`
  if (a.stripeAccountId) return `Stripe — ${a.stripeAccountId}`
  return "No identifier on file"
}

/**
 * Roadmap Phase 1 + CLAUDE.md #7 — the manual-verify path for payout
 * accounts, plus #7's risk-flag surfacing and vendor-level payout hold
 * (designed, not enforced — there's no payout run to gate on yet). Account
 * identifiers are encrypted at rest; only the masked "••••1234" forms ever
 * reach this component.
 */
export function VendorPayoutAccountsSection({ vendorId, accounts, canManage, holdStatus = "NONE", holdReason }: Props) {
  const router = useRouter()
  const [rejectTarget, setRejectTarget] = useState<VendorPayoutAccount | null>(null)
  const [reason, setReason] = useState("")
  const [holdDialog, setHoldDialog] = useState<null | "place" | "release">(null)
  const [holdReasonInput, setHoldReasonInput] = useState("")
  const [pending, setPending] = useState<string | null>(null)

  async function doVerify(accountId: string) {
    setPending(accountId)
    try {
      const res = await fetch(`/api/vendors/accounts/${vendorId}/payout-accounts/${accountId}/verify`, { method: "POST" })
      const data = await res.json()
      if (res.ok) { toast.success("Payout account verified"); router.refresh() }
      else toast.error("Failed to verify", { description: data.message })
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setPending(null)
    }
  }

  async function doReject() {
    if (!rejectTarget || !reason.trim()) return
    setPending(rejectTarget.id)
    try {
      const res = await fetch(`/api/vendors/accounts/${vendorId}/payout-accounts/${rejectTarget.id}/reject`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ reason: reason.trim() }),
      })
      const data = await res.json()
      if (res.ok) { toast.success("Payout account rejected"); setRejectTarget(null); router.refresh() }
      else toast.error("Failed to reject", { description: data.message })
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setPending(null)
    }
  }

  async function doHold(action: "place" | "release") {
    if (action === "place" && !holdReasonInput.trim()) return
    setPending("hold")
    try {
      const res = await fetch(`/api/vendors/accounts/${vendorId}/payout-hold`, {
        method : action === "place" ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body   : action === "place" ? JSON.stringify({ reason: holdReasonInput.trim() }) : undefined,
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(action === "place" ? "Payouts held for this vendor" : "Payout hold released")
        setHoldDialog(null)
        router.refresh()
      } else {
        toast.error("Action failed", { description: data.message })
      }
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setPending(null)
    }
  }

  const isHeld = holdStatus === "HELD"

  return (
    <div className="admin-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Payout Accounts</h2>
        {canManage && (
          isHeld ? (
            <Button
              type="button" variant="outline" size="sm" className="rounded-full gap-1.5"
              disabled={pending !== null} onClick={() => setHoldDialog("release")}
            >
              <PlayCircle className="h-3.5 w-3.5" /> Release payout hold
            </Button>
          ) : (
            <Button
              type="button" variant="outline" size="sm" className="rounded-full gap-1.5 text-destructive hover:bg-destructive-bg"
              disabled={pending !== null} onClick={() => { setHoldReasonInput(""); setHoldDialog("place") }}
            >
              <PauseCircle className="h-3.5 w-3.5" /> Hold payouts
            </Button>
          )
        )}
      </div>

      {isHeld && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-bg/50 px-3 py-2 text-xs text-warning">
          <PauseCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-medium">Payouts are on hold for this vendor.</span>
            {holdReason ? ` ${holdReason}` : ""}
            <span className="mt-0.5 block text-warning/80">Recorded now; enforcement lands with the payout-run work.</span>
          </span>
        </div>
      )}

      {accounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No payout accounts"
          description="This vendor hasn't added a bank, mobile money, or wallet account yet — they can't receive payouts until they do."
        />
      ) : (
        <ul className="divide-y divide-border/60">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="icon-badge icon-badge-info h-9 w-9 shrink-0">
                  <Landmark className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                    {accountIdentifier(a)}
                    {a.isDefault && <Star className="h-3 w-3 shrink-0 fill-warning text-warning" />}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.countryPaymentMethod.paymentMethod.name}
                    {a.accountHolderName ? ` · ${a.accountHolderName}` : ""}
                    {a.failureReason && a.verificationStatus === "FAILED" ? ` — ${a.failureReason}` : ""}
                  </p>
                  {methodLabel(a.verificationMethod) && (
                    <p className="truncate text-[11px] text-muted-foreground/80">
                      {methodLabel(a.verificationMethod)}
                      {a.verifiedAt ? ` · ${new Date(a.verifiedAt).toLocaleDateString()}` : ""}
                    </p>
                  )}
                  {a.duplicateElsewhere > 0 && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-warning">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      Also used by {a.duplicateElsewhere} other vendor{a.duplicateElsewhere === 1 ? "" : "s"} in this country
                    </p>
                  )}
                  {(a.riskFlags ?? []).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(a.riskFlags ?? []).map((f) => (
                        <span key={f} className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-medium text-warning">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {RISK_LABEL[f]}
                          {f === "NAME_MISMATCH" && a.nameMatchScore != null ? ` (${Math.round(a.nameMatchScore * 100)}%)` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={STATUS_BADGE[a.verificationStatus]}>{STATUS_LABEL[a.verificationStatus]}</span>
                {canManage && a.verificationStatus !== "VERIFIED" && (
                  <Button
                    type="button" variant="outline" size="sm" className="rounded-full gap-1.5"
                    disabled={pending !== null} onClick={() => doVerify(a.id)}
                  >
                    {pending === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    Verify
                  </Button>
                )}
                {canManage && a.verificationStatus !== "FAILED" && (
                  <Button
                    type="button" variant="outline" size="sm" className="rounded-full gap-1.5 text-destructive hover:bg-destructive-bg"
                    disabled={pending !== null} onClick={() => { setReason(""); setRejectTarget(a) }}
                  >
                    <ShieldX className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!rejectTarget} onOpenChange={(o) => !pending && !o && setRejectTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-danger h-11 w-11"><ShieldX className="h-5 w-5" /></div>
            <AlertDialogTitle>Reject payout account</AlertDialogTitle>
            <AlertDialogDescription>
              {rejectTarget && accountIdentifier(rejectTarget)} will be marked as failed verification. The vendor will need to fix and resubmit it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this account failed verification…" className="min-h-20 text-sm" />
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setRejectTarget(null)} disabled={pending !== null}>Cancel</Button>
            <Button type="button" variant="destructive" className="rounded-full gap-1.5" disabled={pending !== null || !reason.trim()} onClick={doReject}>
              {pending === rejectTarget?.id && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm Reject
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={holdDialog !== null} onOpenChange={(o) => !pending && !o && setHoldDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className={`icon-badge h-11 w-11 ${holdDialog === "release" ? "icon-badge-success" : "icon-badge-warning"}`}>
              {holdDialog === "release" ? <PlayCircle className="h-5 w-5" /> : <PauseCircle className="h-5 w-5" />}
            </div>
            <AlertDialogTitle>{holdDialog === "release" ? "Release payout hold" : "Hold payouts for this vendor"}</AlertDialogTitle>
            <AlertDialogDescription>
              {holdDialog === "release"
                ? "Payouts will no longer be flagged as held for this vendor."
                : "This records a hold on the vendor's payouts. Enforcement (skipping them in a payout batch) lands with the payout-run work — the record is created now so it isn't lost."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {holdDialog === "place" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Reason *</Label>
              <Textarea value={holdReasonInput} onChange={(e) => setHoldReasonInput(e.target.value)} placeholder="Why payouts are being held…" className="min-h-20 text-sm" />
            </div>
          )}
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setHoldDialog(null)} disabled={pending !== null}>Cancel</Button>
            <Button
              type="button"
              variant={holdDialog === "release" ? "default" : "destructive"}
              className="rounded-full gap-1.5"
              disabled={pending !== null || (holdDialog === "place" && !holdReasonInput.trim())}
              onClick={() => doHold(holdDialog === "release" ? "release" : "place")}
            >
              {pending === "hold" && <Loader2 className="h-4 w-4 animate-spin" />}
              {holdDialog === "release" ? "Release hold" : "Confirm hold"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
