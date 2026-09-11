"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, ShieldCheck, ShieldX } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from "@repo/ui/components/alert-dialog"

interface Props {
  accountId: string
  identifier: string
  verificationStatus: "PENDING" | "VERIFIED" | "FAILED" | "REQUIRES_REVIEW"
  canVerify: boolean
  verifyBlockedReason: string | null
  canManage: boolean
  /**
   * Whether the viewer holds the claim on this review. The backend requires it
   * (assertPayoutReviewClaimedByActor) — exactly one owner when money is
   * decided — so showing the buttons to anyone else offers an action that can
   * only 403. Undefined means "not applicable", e.g. the compact list row.
   */
  isClaimedByMe?: boolean
  /** compact = inline row buttons (list view); full = the detail page */
  variant?: "compact" | "full"
}

/*
 * The Finance-side review action for one payout account. Verify / reject
 * route through the same backend service the vendor-detail-page action uses
 * (VENDORS_PAYOUT_ACCOUNTS_MANAGE), so there's one audit trail. Verify is
 * hidden entirely when the provider definitively rejected the account (§12).
 */
export function PayoutAccountReviewActions({
  accountId, identifier, verificationStatus, canVerify, verifyBlockedReason, canManage,
  isClaimedByMe = false, variant = "full",
}: Props) {
  const router = useRouter()
  const [pending, setPending] = useState<null | "verify" | "reject">(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState("")

  if (!canManage) return null

  /*
   * A decided account is past this control entirely. Reject would write
   * FAILED over a completed verification, which claims it never succeeded —
   * the post-decision actions (deactivate, flag for senior review) live in
   * PayoutDecidedActions instead.
   */
  const isDecided = verificationStatus === "VERIFIED" || verificationStatus === "FAILED"
  if (isDecided) return null

  if (!isClaimedByMe) {
    return variant === "full" ? (
      <p className="text-xs text-muted-foreground">
        Claim this review before you can verify or reject it.
      </p>
    ) : null
  }

  async function run(op: "verify" | "reject", body?: unknown) {
    setPending(op)
    try {
      const res = await fetch(`/api/finance/payout-accounts/${accountId}/${op}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(op === "verify" ? "Payout account verified" : "Payout account rejected")
        setRejectOpen(false)
        router.refresh()
      } else {
        toast.error(data.message ?? "Action failed")
      }
    } catch {
      toast.error("Network error")
    } finally {
      setPending(null)
    }
  }

  const size = variant === "compact" ? "sm" : "default"

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canVerify && (
        <Button
          type="button" variant="outline" size={size} className="gap-1.5 rounded-full"
          disabled={pending !== null} onClick={() => run("verify")}
        >
          {pending === "verify" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          Verify
        </Button>
      )}
      {!canVerify && verifyBlockedReason && variant === "full" && (
        <p className="text-xs text-muted-foreground">{verifyBlockedReason}</p>
      )}
      <Button
        type="button" variant="outline" size={size}
        className="gap-1.5 rounded-full text-destructive hover:bg-destructive-bg"
        disabled={pending !== null} onClick={() => { setReason(""); setRejectOpen(true) }}
      >
        <ShieldX className="h-3.5 w-3.5" />
        Reject
      </Button>

      <AlertDialog open={rejectOpen} onOpenChange={(o) => !pending && setRejectOpen(o)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-danger h-11 w-11"><ShieldX className="h-5 w-5" /></div>
            <AlertDialogTitle>Reject payout account</AlertDialogTitle>
            <AlertDialogDescription>
              {identifier} will be marked as failed verification. The vendor is notified and will need to correct and re-add it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this account can't be verified…"
              className="min-h-20 text-sm"
            />
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" disabled={pending !== null} onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button" variant="destructive" className="rounded-full gap-1.5"
              disabled={pending !== null || !reason.trim()}
              onClick={() => run("reject", { reason: reason.trim() })}
            >
              {pending === "reject" && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm reject
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
