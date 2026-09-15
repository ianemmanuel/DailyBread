"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Loader2, ShieldOff, ShieldCheck, Bell, Flag, UserCheck, UserCog, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
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
import type { ComplianceIssueItem, EligibleReviewer } from "@/types"

interface Props {
  issue: ComplianceIssueItem
  /** VENDORS_ACCOUNTS_COMPLIANCE_MANAGE — waive/revoke/notify */
  canManage: boolean
  /** VENDORS_COMPLIANCE_CLAIM */
  canClaim: boolean
  /** VENDORS_COMPLIANCE_ESCALATE */
  canEscalate: boolean
  /** VENDORS_COMPLIANCE_REASSIGN */
  canReassign: boolean
}

type Dialog = "waive" | "revoke" | "escalate" | "reassign" | null

function todayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json()
  return { ok: res.ok, data }
}

/**
 * Per-row compliance actions. 2026-08-26 refinement (CLAUDE.md):
 *  - Waive/Revoke/Notify (VENDORS_ACCOUNTS_COMPLIANCE_MANAGE) now require
 *    the actor to already be the CLAIMED owner — the backend enforces
 *    this (assertClaimedByActor), this component just hides the buttons
 *    and shows a hint instead of letting an admin hit a 403.
 *  - Reassign (VENDORS_COMPLIANCE_REASSIGN) is a supervisory hand-off —
 *    doesn't require ownership, transfers the case directly, no separate
 *    "accept" step for the target.
 *  - Escalate is hidden once the case was claimed directly out of the
 *    open escalation pool (claimedFromEscalation) — that admin is the
 *    terminal resolver. A reassigned admin can still escalate.
 * A CRITICAL-severity issue also surfaces a "Suspend vendor" shortcut —
 * suspend itself only ever happens on the vendor detail page (one click
 * away), never duplicated into a per-row form here.
 */
export function ComplianceIssueActions({ issue, canManage, canClaim, canEscalate, canReassign }: Props) {
  const router = useRouter()
  const session = useAdminSession()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [reason, setReason] = useState("")
  const [expiresAt, setExpiresAt] = useState(todayPlus(14))
  const [pending, setPending] = useState<string | null>(null)
  const [targets, setTargets] = useState<EligibleReviewer[]>([])
  const [targetAdminId, setTargetAdminId] = useState("")
  const [loadingTargets, setLoadingTargets] = useState(false)

  const isWaived = issue.issueStatus === "WAIVED"
  const kase = issue.case
  const isMine = kase?.assignedReviewerId === session.id
  const isEscalated = !!kase?.escalatedByAdminId
  const isEscalatedByMe = kase?.escalatedByAdminId === session.id
  const canReceiveEscalation = session.permissions.includes(AdminPermissions.VENDORS_COMPLIANCE_RECEIVE_ESCALATION)
    && !session.scope.isGlobal && session.scope.countryIds.includes(issue.vendor.countryId)
  // Reassigning out of the open escalation pool needs the narrower
  // RECEIVE_ESCALATION-holder target list — matches what the backend
  // will actually enforce on submit (see reassignComplianceCase).
  const isOpenEscalationPool = isEscalated && !kase?.assignedReviewerId
  const canShowManageActions = canManage && isMine
  // "Assign" for a case that's never been claimed (nothing to hand off
  // from yet — a supervisor is picking the first owner), "Reassign" once
  // someone already owns it (a genuine hand-off). Same distinction the
  // user asked for; the backend action (reassignComplianceCase) is
  // identical either way, this is copy only.
  const isAssignAction = !kase?.assignedReviewerId

  useEffect(() => {
    if (dialog !== "reassign") return
    setLoadingTargets(true)
    setTargetAdminId("")
    fetch(`/api/vendors/compliance/cases/eligible-targets?vendorId=${issue.vendor.id}&for=${isOpenEscalationPool ? "escalate" : "reassign"}`)
      .then((r) => r.json())
      .then((data) => setTargets(data?.data ?? []))
      .catch(() => setTargets([]))
      .finally(() => setLoadingTargets(false))
  }, [dialog, issue.vendor.id, isOpenEscalationPool])

  async function doNotify() {
    setPending("notify")
    const { ok, data } = await postJson("/api/vendors/compliance/notify", {
      vendorId: issue.vendor.id, documentTypeId: issue.documentType.id, issueType: issue.caseKind,
    })
    if (ok) toast.success(data?.data?.sent ? "Vendor notified by email" : "Notification recorded (email not sent — not configured)")
    else toast.error("Failed to notify", { description: data.message })
    setPending(null)
  }

  async function doClaim() {
    setPending("claim")
    const { ok, data } = await postJson("/api/vendors/compliance/cases/claim", {
      vendorId: issue.vendor.id, documentTypeId: issue.documentType.id, issueType: issue.caseKind,
    })
    if (ok) { toast.success("Case claimed"); router.refresh() }
    else toast.error("Failed to claim", { description: data.message })
    setPending(null)
  }

  async function doEscalate() {
    if (!reason.trim()) return
    setPending("escalate")
    const { ok, data } = await postJson("/api/vendors/compliance/cases/escalate", {
      vendorId: issue.vendor.id, documentTypeId: issue.documentType.id, issueType: issue.caseKind, reason: reason.trim(),
    })
    if (ok) { toast.success("Case escalated"); setDialog(null); router.refresh() }
    else toast.error("Failed to escalate", { description: data.message })
    setPending(null)
  }

  async function doReassign() {
    if (!targetAdminId) return
    setPending("reassign")
    const { ok, data } = await postJson("/api/vendors/compliance/cases/reassign", {
      vendorId: issue.vendor.id, documentTypeId: issue.documentType.id, issueType: issue.caseKind,
      targetAdminId, reason: reason.trim() || undefined,
    })
    if (ok) { toast.success("Case reassigned"); setDialog(null); router.refresh() }
    else toast.error("Failed to reassign", { description: data.message })
    setPending(null)
  }

  async function doWaive() {
    if (!reason.trim() || !expiresAt) return
    setPending("waive")
    const { ok, data } = await postJson("/api/vendors/compliance/waivers", {
      vendorId: issue.vendor.id, documentTypeId: issue.documentType.id, reason: reason.trim(), expiresAt: new Date(expiresAt).toISOString(),
    })
    if (ok) { toast.success("Compliance issue waived"); setDialog(null); router.refresh() }
    else toast.error("Failed to waive", { description: data.message })
    setPending(null)
  }

  async function doRevoke() {
    if (!issue.waiver) return
    setPending("revoke")
    const { ok, data } = await postJson(`/api/vendors/compliance/waivers/${issue.waiver.id}/revoke`, { reason: reason.trim() || undefined })
    if (ok) { toast.success("Waiver revoked"); setDialog(null); router.refresh() }
    else toast.error("Failed to revoke", { description: data.message })
    setPending(null)
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {isWaived ? (
        <>
          {canShowManageActions && (
            <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => { setReason(""); setDialog("revoke") }}>
              <ShieldCheck className="h-3.5 w-3.5" />
              Revoke
            </Button>
          )}
          {canManage && !isMine && kase && (
            <span className="text-xs text-muted-foreground">Claimed by {kase.assignedReviewerName ?? "another admin"} — claim to revoke</span>
          )}
          {canReassign && (
            <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => { setReason(""); setDialog("reassign") }}>
              <UserCog className="h-3.5 w-3.5" />
              {isAssignAction ? "Assign" : "Reassign"}
            </Button>
          )}
        </>
      ) : (
        <>
          {issue.severity === "CRITICAL" && (
            <Link
              href={`/vendors/accounts/${issue.vendor.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive-bg"
            >
              Suspend vendor <ArrowUpRight className="h-3 w-3" />
            </Link>
          )}

          {canClaim && !kase?.assignedReviewerId && !isEscalated && (
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
          {/* Escalate now requires you already hold the claim — no more
              escalating an unclaimed case straight out from under whoever
              might claim it (see assertClaimedForEscalate on the backend). */}
          {canEscalate && isMine && !kase?.claimedFromEscalation && !isEscalatedByMe && (
            <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => { setReason(""); setDialog("escalate") }}>
              <Flag className="h-3.5 w-3.5" />
              Escalate
            </Button>
          )}
          {canEscalate && !canManage && !isMine && !kase?.assignedReviewerId && !isEscalated && (
            <span className="text-xs text-muted-foreground">Claim before you can escalate</span>
          )}
          {canReassign && (
            <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => { setReason(""); setDialog("reassign") }}>
              <UserCog className="h-3.5 w-3.5" />
              {isAssignAction ? "Assign" : "Reassign"}
            </Button>
          )}

          {canShowManageActions && (
            <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" disabled={pending !== null} onClick={doNotify}>
              {pending === "notify" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
              Notify
            </Button>
          )}
          {canShowManageActions && (
            <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5 text-warning hover:bg-warning-bg" onClick={() => { setReason(""); setExpiresAt(todayPlus(14)); setDialog("waive") }}>
              <ShieldOff className="h-3.5 w-3.5" />
              Waive
            </Button>
          )}
          {canManage && !isMine && kase?.assignedReviewerId && (
            <span className="text-xs text-muted-foreground">Claimed by {kase.assignedReviewerName ?? "another admin"} — claim to manage</span>
          )}
          {canManage && !kase?.assignedReviewerId && !canClaim && (
            <span className="text-xs text-muted-foreground">Unclaimed — claim before you can manage it</span>
          )}
        </>
      )}

      <AlertDialog open={dialog !== null} onOpenChange={(o) => !pending && !o && setDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          {dialog === "waive" && (
            <>
              <AlertDialogHeader>
                <div className="icon-badge icon-badge-warning h-11 w-11"><ShieldOff className="h-5 w-5" /></div>
                <AlertDialogTitle>Waive compliance issue</AlertDialogTitle>
                <AlertDialogDescription>
                  {issue.documentType.name} for {issue.vendor.legalBusinessName} won&apos;t count as an open issue until it expires. The underlying document status is unchanged — this is an exception, not an approval.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Reason *</Label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this exception is being granted…" className="min-h-20 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Waived until *</Label>
                  <Input type="date" value={expiresAt} min={todayPlus(1)} onChange={(e) => setExpiresAt(e.target.value)} className="rounded-xl text-sm" />
                </div>
              </div>
              <AlertDialogFooter>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialog(null)} disabled={pending !== null}>Cancel</Button>
                <Button type="button" className="rounded-full gap-1.5" disabled={pending !== null || !reason.trim() || !expiresAt} onClick={doWaive}>
                  {pending === "waive" && <Loader2 className="h-4 w-4 animate-spin" />}
                  {pending === "waive" ? "Saving…" : "Confirm Waive"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
          {dialog === "revoke" && (
            <>
              <AlertDialogHeader>
                <div className="icon-badge icon-badge-success h-11 w-11"><ShieldCheck className="h-5 w-5" /></div>
                <AlertDialogTitle>Revoke waiver</AlertDialogTitle>
                <AlertDialogDescription>
                  This issue ({issue.documentType.name} — {issue.vendor.legalBusinessName}) will count toward open issues again immediately.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1.5">
                <Label className="text-xs">Reason (optional)</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this waiver is being revoked…" className="min-h-20 text-sm" />
              </div>
              <AlertDialogFooter>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialog(null)} disabled={pending !== null}>Cancel</Button>
                <Button type="button" className="rounded-full gap-1.5" disabled={pending !== null} onClick={doRevoke}>
                  {pending === "revoke" && <Loader2 className="h-4 w-4 animate-spin" />}
                  {pending === "revoke" ? "Saving…" : "Confirm Revoke"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
          {dialog === "escalate" && (
            <>
              <AlertDialogHeader>
                <div className="icon-badge icon-badge-danger h-11 w-11"><Flag className="h-5 w-5" /></div>
                <AlertDialogTitle>Escalate compliance case</AlertDialogTitle>
                <AlertDialogDescription>
                  {issue.documentType.name} for {issue.vendor.legalBusinessName} will move to the escalation pool for this country's senior reviewers. Once someone claims it from the pool, they must resolve it directly — it can't be escalated again.
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
                <AlertDialogTitle>{isAssignAction ? "Assign compliance case" : "Reassign compliance case"}</AlertDialogTitle>
                <AlertDialogDescription>
                  {issue.documentType.name} for {issue.vendor.legalBusinessName} will be assigned directly — the new owner is responsible immediately, no separate claim step.
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
