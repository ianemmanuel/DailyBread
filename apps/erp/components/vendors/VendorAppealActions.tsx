"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Loader2, UserCheck, Flag, UserCog, Gavel, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import { useAdminSession } from "@/providers/admin-session-provider"
import { AdminPermissions } from "@repo/types/admin-app"
import type { VendorAppeal, EligibleReviewer } from "@/types"

interface Props {
  appeal: VendorAppeal
  /** VENDORS_APPEALS_MANAGE — log new appeals, resolve one you hold the claim on */
  canManage: boolean
  /** VENDORS_APPEALS_CLAIM */
  canClaim: boolean
  /** VENDORS_APPEALS_ESCALATE */
  canEscalate: boolean
  /** VENDORS_APPEALS_REASSIGN */
  canReassign: boolean
}

type Dialog = "resolve" | "escalate" | "reassign" | null

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json()
  return { ok: res.ok, data }
}

/**
 * Per-row appeal actions. 2026-08-28 rework brought this to claim/escalate/
 * reassign parity with ComplianceIssueActions — see
 * admin.vendor.appeal.service.ts's file-level comment for the reasoning.
 * Resolving now requires you already hold the claim (backend-enforced;
 * this component just hides the button and shows a hint instead of
 * letting an admin hit a 403).
 *
 * Resolving OVERTURNED never auto-reverses the underlying decision — this
 * only offers a shortcut link to where that's actually done (the vendor
 * detail page's existing reinstate/unban actions). A rejected application
 * has no reversal action at all yet (known, documented gap — see
 * CLAUDE.md's VM-P1-04 entry), so no shortcut is shown for that case.
 */
export function VendorAppealActions({ appeal, canManage, canClaim, canEscalate, canReassign }: Props) {
  const router = useRouter()
  const session = useAdminSession()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [outcome, setOutcome] = useState<"UPHELD" | "OVERTURNED">("UPHELD")
  const [note, setNote] = useState("")
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState<string | null>(null)
  const [targets, setTargets] = useState<EligibleReviewer[]>([])
  const [targetAdminId, setTargetAdminId] = useState("")
  const [loadingTargets, setLoadingTargets] = useState(false)

  const isResolved = appeal.status === "UPHELD" || appeal.status === "OVERTURNED"
  const isMine = appeal.assignedReviewerId === session.id
  const isEscalated = appeal.status === "ESCALATED"
  const isEscalatedByMe = appeal.escalatedByAdminId === session.id
  const canReceiveEscalation = session.permissions.includes(AdminPermissions.VENDORS_APPEALS_RECEIVE_ESCALATION)
    && !session.scope.isGlobal && !!appeal.countryId && session.scope.countryIds.includes(appeal.countryId)
  const isOpenEscalationPool = isEscalated && !appeal.assignedReviewerId
  const isAssignAction = !appeal.assignedReviewerId

  useEffect(() => {
    if (dialog !== "reassign") return
    setLoadingTargets(true)
    setTargetAdminId("")
    fetch(`/api/vendors/appeals/eligible-targets?appealId=${appeal.id}&for=${isOpenEscalationPool ? "escalate" : "reassign"}`)
      .then((r) => r.json())
      .then((data) => setTargets(data?.data ?? []))
      .catch(() => setTargets([]))
      .finally(() => setLoadingTargets(false))
  }, [dialog, appeal.id, isOpenEscalationPool])

  async function doClaim() {
    setPending("claim")
    const { ok, data } = await postJson(`/api/vendors/appeals/${appeal.id}/claim`)
    if (ok) { toast.success("Appeal claimed"); router.refresh() }
    else toast.error("Failed to claim", { description: data.message })
    setPending(null)
  }

  async function doEscalate() {
    if (!reason.trim()) return
    setPending("escalate")
    const { ok, data } = await postJson(`/api/vendors/appeals/${appeal.id}/escalate`, { reason: reason.trim() })
    if (ok) { toast.success("Appeal escalated"); setDialog(null); router.refresh() }
    else toast.error("Failed to escalate", { description: data.message })
    setPending(null)
  }

  async function doReassign() {
    if (!targetAdminId) return
    setPending("reassign")
    const { ok, data } = await postJson(`/api/vendors/appeals/${appeal.id}/reassign`, { targetAdminId, reason: reason.trim() || undefined })
    if (ok) { toast.success("Appeal reassigned"); setDialog(null); router.refresh() }
    else toast.error("Failed to reassign", { description: data.message })
    setPending(null)
  }

  async function doResolve() {
    setPending("resolve")
    const res = await fetch(`/api/vendors/appeals/${appeal.id}/resolve`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, resolutionNote: note.trim() || undefined }),
    })
    const data = await res.json()
    if (res.ok) { toast.success("Appeal resolved"); setDialog(null); router.refresh() }
    else toast.error("Failed to resolve", { description: data.message })
    setPending(null)
  }

  if (isResolved) {
    if (appeal.status !== "OVERTURNED") return null
    if (appeal.subjectType === "ACCOUNT_SUSPENSION") {
      return (
        <Link href={`/vendors/accounts/${appeal.vendorId}`} className="inline-flex items-center gap-1 rounded-full border border-success/40 px-2.5 py-1 text-xs font-medium text-success hover:bg-success-bg">
          Reinstate vendor <ArrowUpRight className="h-3 w-3" />
        </Link>
      )
    }
    if (appeal.subjectType === "ACCOUNT_BAN") {
      return (
        <Link href={`/vendors/accounts/${appeal.vendorId}`} className="inline-flex items-center gap-1 rounded-full border border-success/40 px-2.5 py-1 text-xs font-medium text-success hover:bg-success-bg">
          Unban vendor <ArrowUpRight className="h-3 w-3" />
        </Link>
      )
    }
    return <span className="text-xs text-muted-foreground">No reopen action exists yet</span>
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {canClaim && !appeal.assignedReviewerId && !isEscalated && (
        <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" disabled={pending !== null} onClick={doClaim}>
          {pending === "claim" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
          Claim
        </Button>
      )}
      {canReceiveEscalation && isOpenEscalationPool && !isEscalatedByMe && (
        <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" disabled={pending !== null} onClick={doClaim}>
          {pending === "claim" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
          Claim escalation
        </Button>
      )}
      {canEscalate && isMine && !appeal.claimedFromEscalation && !isEscalatedByMe && (
        <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => { setReason(""); setDialog("escalate") }}>
          <Flag className="h-3.5 w-3.5" />
          Escalate
        </Button>
      )}
      {canEscalate && !isMine && !appeal.assignedReviewerId && !isEscalated && (
        <span className="text-xs text-muted-foreground">Claim before you can escalate</span>
      )}
      {canReassign && (
        <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => { setReason(""); setDialog("reassign") }}>
          <UserCog className="h-3.5 w-3.5" />
          {isAssignAction ? "Assign" : "Reassign"}
        </Button>
      )}
      {canManage && isMine && (
        <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => { setOutcome("UPHELD"); setNote(""); setDialog("resolve") }}>
          <Gavel className="h-3.5 w-3.5" />
          Resolve
        </Button>
      )}
      {canManage && !isMine && appeal.assignedReviewerId && (
        <span className="text-xs text-muted-foreground">Claimed by {appeal.assignedReviewerName ?? "another admin"} — claim to resolve</span>
      )}
      {canManage && !appeal.assignedReviewerId && !canClaim && (
        <span className="text-xs text-muted-foreground">Unclaimed — claim before you can resolve it</span>
      )}

      <AlertDialog open={dialog !== null} onOpenChange={(o) => !pending && !o && setDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          {dialog === "resolve" && (
            <>
              <AlertDialogHeader>
                <div className="icon-badge icon-badge-primary h-11 w-11"><Gavel className="h-5 w-5" /></div>
                <AlertDialogTitle>Resolve appeal</AlertDialogTitle>
                <AlertDialogDescription>
                  {appeal.subjectName} — this records the outcome. Overturning does not automatically reverse the original decision; use the shortcut this row shows afterward.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Outcome *</Label>
                  <Select value={outcome} onValueChange={(v) => setOutcome(v as "UPHELD" | "OVERTURNED")}>
                    <SelectTrigger className="w-full rounded-xl text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="UPHELD">Upheld — original decision stands</SelectItem>
                      <SelectItem value="OVERTURNED">Overturned — original decision reversed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Resolution note (optional)</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Grounds for the decision…" className="min-h-20 text-sm" />
                </div>
              </div>
              <AlertDialogFooter>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialog(null)} disabled={pending !== null}>Cancel</Button>
                <Button type="button" className="rounded-full gap-1.5" disabled={pending !== null} onClick={doResolve}>
                  {pending === "resolve" && <Loader2 className="h-4 w-4 animate-spin" />}
                  {pending === "resolve" ? "Saving…" : "Confirm"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
          {dialog === "escalate" && (
            <>
              <AlertDialogHeader>
                <div className="icon-badge icon-badge-danger h-11 w-11"><Flag className="h-5 w-5" /></div>
                <AlertDialogTitle>Escalate appeal</AlertDialogTitle>
                <AlertDialogDescription>
                  {appeal.subjectName}&apos;s appeal will move to the escalation pool for this country&apos;s senior reviewers. Once someone claims it from the pool, they must resolve it directly — it can&apos;t be escalated again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1.5">
                <Label className="text-xs">Reason *</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this needs senior review…" className="min-h-20 text-sm" />
              </div>
              <AlertDialogFooter>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialog(null)} disabled={pending !== null}>Cancel</Button>
                <Button type="button" variant="destructive" className="rounded-full gap-1.5" disabled={pending !== null || !reason.trim()} onClick={doEscalate}>
                  {pending === "escalate" && <Loader2 className="h-4 w-4 animate-spin" />}
                  {pending === "escalate" ? "Saving…" : "Confirm Escalate"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
          {dialog === "reassign" && (
            <>
              <AlertDialogHeader>
                <div className="icon-badge icon-badge-primary h-11 w-11"><UserCog className="h-5 w-5" /></div>
                <AlertDialogTitle>{isAssignAction ? "Assign appeal" : "Reassign appeal"}</AlertDialogTitle>
                <AlertDialogDescription>
                  {appeal.subjectName}&apos;s appeal will be assigned directly — the new owner is responsible immediately, no separate claim step.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Assign to *</Label>
                  <Select value={targetAdminId} onValueChange={setTargetAdminId} disabled={loadingTargets}>
                    <SelectTrigger className="w-full rounded-xl text-sm">
                      <SelectValue placeholder={loadingTargets ? "Loading admins…" : targets.length === 0 ? "No eligible admins found" : "Select an admin…"} />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {targets.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName} — {t.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Note (optional)</Label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isAssignAction ? "Why this is being assigned…" : "Why this is being reassigned…"} className="min-h-20 text-sm" />
                </div>
              </div>
              <AlertDialogFooter>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialog(null)} disabled={pending !== null}>Cancel</Button>
                <Button type="button" className="rounded-full gap-1.5" disabled={pending !== null || !targetAdminId} onClick={doReassign}>
                  {pending === "reassign" && <Loader2 className="h-4 w-4 animate-spin" />}
                  {pending === "reassign" ? "Saving…" : isAssignAction ? "Confirm Assign" : "Confirm Reassign"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
