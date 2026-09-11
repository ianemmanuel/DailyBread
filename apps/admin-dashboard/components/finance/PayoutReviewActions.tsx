"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Hand, ArrowUpRight, UserCog, Undo2 } from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog"
import { Textarea } from "@repo/ui/components/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@repo/ui/components/select"
import type { AdminPayoutAccountDetail } from "@repo/types/admin-app"

/*
 * Claim / release / escalate / reassign for one payout account — the same
 * control set and wording as ComplianceIssueActions and VendorAppealActions,
 * so an admin who has worked either of those queues already knows this one.
 *
 * The two hand-offs are deliberately different actions, matching the backend:
 *   Escalate — no target. Returns it to the open in-country pool for any
 *              escalation receiver to claim.
 *   Reassign — names the receiving admin. A supervisory override that does
 *              not require the actor to hold the claim.
 *
 * Every button here is UX only: the backend re-checks ownership, the
 * terminal-escalation rule and scope on each call.
 */

interface Props {
  accountId : string
  vendorName: string
  detail    : AdminPayoutAccountDetail
  actorId   : string
  can: {
    claim   : boolean
    escalate: boolean
    reassign: boolean
  }
}

type Target = { id: string; name: string; email: string }

export function PayoutReviewActions({ accountId, vendorName, detail, actorId, can }: Props) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState("")
  const [targets, setTargets] = React.useState<Target[] | null>(null)
  const [targetId, setTargetId] = React.useState("")

  const state = detail.reviewState
  const isMine = detail.assignedReviewerId === actorId
  if (state === "RESOLVED") return null

  async function call(op: string, body?: unknown) {
    setBusy(op)
    try {
      const res = await fetch(`/api/finance/payout-accounts/${accountId}/${op}`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message ?? "Action failed")
      toast.success(json?.message ?? "Done")
      setReason("")
      setTargetId("")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed")
    } finally {
      setBusy(null)
    }
  }

  async function loadTargets() {
    if (targets) return
    const res = await fetch(`/api/finance/payout-accounts/${accountId}/eligible-targets`)
    const json = await res.json()
    setTargets(json?.data?.targets ?? [])
  }

  const btn = "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Claim — only while unowned. The backend refuses a second claimer. */}
      {can.claim && !detail.assignedReviewerId && (
        <button type="button" className={btn} disabled={!!busy} onClick={() => call("claim")}>
          {busy === "claim" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hand className="h-3.5 w-3.5" />}
          {state === "ESCALATED" ? "Claim from pool" : "Claim"}
        </button>
      )}

      {can.claim && isMine && (
        <button type="button" className={btn} disabled={!!busy} onClick={() => call("release")}>
          {busy === "release" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
          Release
        </button>
      )}

      {/* Escalate — requires the claim, and is refused outright once this
          admin got it FROM the pool (terminal-escalation rule). */}
      {can.escalate && isMine && !detail.claimedFromEscalation && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button type="button" className={btn} disabled={!!busy}>
              <ArrowUpRight className="h-3.5 w-3.5" />
              Escalate
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Escalate this payout account</AlertDialogTitle>
              <AlertDialogDescription>
                It returns to the open pool for {vendorName}&apos;s country. Any admin there who receives
                payout escalations can pick it up — you will not be able to act on it again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why does this need a more senior reviewer?"
              rows={3}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={!reason.trim()} onClick={() => call("escalate", { reason })}>
                Escalate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Reassign — supervisory, no ownership required. Reads "Assign" until
          somebody has actually held it, same wording fix as compliance. */}
      {can.reassign && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button type="button" className={btn} disabled={!!busy} onClick={loadTargets}>
              <UserCog className="h-3.5 w-3.5" />
              {detail.assignedReviewerId ? "Reassign" : "Assign"}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{detail.assignedReviewerId ? "Reassign" : "Assign"} this review</AlertDialogTitle>
              <AlertDialogDescription>
                {state === "ESCALATED"
                  ? "This account is in the escalation pool, so only admins who receive payout escalations are listed."
                  : "Pick an admin in this vendor's country to take the review."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger><SelectValue placeholder="Choose an admin…" /></SelectTrigger>
              <SelectContent>
                {(targets ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {targets?.length === 0 && (
              <p className="text-xs text-muted-foreground">No eligible admin in this country.</p>
            )}
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              rows={2}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={!targetId}
                onClick={() => call("reassign", { targetAdminId: targetId, reason })}
              >
                {detail.assignedReviewerId ? "Reassign" : "Assign"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
