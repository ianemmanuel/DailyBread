"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, Loader2,
  UserCheck, UserX, ArrowRightLeft, TriangleAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
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
import {
  rejectApplicationSchema,
  needsRevisionSchema,
  type RejectApplicationFormValues,
  type NeedsRevisionFormValues,
} from "@/lib/zod/vendor"
import { getFieldError } from "@/lib/forms/form-helpers"
import { useApplicationActionReasons } from "@/lib/queries/action-reasons"
import type { AdminActionReason } from "@repo/types/admin-app"
import type { EligibleReviewer } from "@/types"

interface Props {
  applicationId  : string
  currentStatus  : string
  allDocsApproved: boolean
  /** VENDORS_APPLICATIONS_REVIEW */
  canReview : boolean
  /** VENDORS_APPLICATIONS_APPROVE */
  canApprove: boolean
  /** VENDORS_APPLICATIONS_REJECT */
  canReject : boolean
  /** VENDORS_APPLICATIONS_CLAIM */
  canClaim  : boolean
  /** VENDORS_APPLICATIONS_REASSIGN */
  canReassign: boolean
  /** VENDORS_APPLICATIONS_ESCALATE */
  canEscalate: boolean
  /** VENDORS_APPLICATIONS_RECEIVE_ESCALATION */
  canReceiveEscalation: boolean
  assignedReviewerId  : string | null
  assignedReviewerName: string | null
  currentAdminId       : string
  escalatedByAdminId  : string | null
  escalatedByAdminName: string | null
  escalationReason    : string | null
}

type Dialog = "review" | "approve" | "reject" | "revision" | "reassign" | "escalate" | null
type Action = "review" | "approve" | "claim"

const ACTIVE_STATUSES = ["SUBMITTED", "UNDER_REVIEW"]

export function ApplicationActions({
  applicationId, currentStatus, allDocsApproved, canReview, canApprove, canReject,
  canClaim, canReassign, canEscalate, canReceiveEscalation,
  assignedReviewerId, assignedReviewerName, currentAdminId,
  escalatedByAdminId, escalatedByAdminName, escalationReason,
}: Props) {
  const router = useRouter()

  const isUnclaimed        = !assignedReviewerId
  const isClaimedByMe      = assignedReviewerId === currentAdminId
  const isClaimedByOther   = !!assignedReviewerId && !isClaimedByMe
  const isEscalated        = !!escalatedByAdminId
  const isEscalatedByMe    = escalatedByAdminId === currentAdminId
  const isOpenEscalation   = isEscalated && isUnclaimed

  const [openDialog, setOpenDialog] = useState<Dialog>(null)
  const [pending,     setPending]   = useState<Action | "reassign" | "escalate" | null>(null)
  const [formError,   setFormError] = useState<string | null>(null)

  const { data: rejectReasons }   = useApplicationActionReasons("vendor_application.rejected")
  const { data: revisionReasons } = useApplicationActionReasons("vendor_application.needs_revision")

  async function dispatch(action: string, body?: object): Promise<{ ok: boolean; message?: string }> {
    const res = await fetch(
      `/api/vendors/applications/${applicationId}/${action}`,
      {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : body ? JSON.stringify(body) : undefined,
      },
    )
    const data = await res.json()
    return { ok: res.ok, message: data.message }
  }

  const ACTION_COPY: Record<Action, { success: string; description: string; failTitle: string }> = {
    claim: {
      success: "Application claimed",
      description: "You're now the assigned reviewer — other reviewers can't act on it unless it's reassigned.",
      failTitle: "Claim failed",
    },
    review: {
      success: "Marked as under review",
      description: "The application has been moved to Under Review.",
      failTitle: "Action failed",
    },
    approve: {
      success: "Application approved",
      description: "The vendor account has been created successfully.",
      failTitle: "Approval failed",
    },
  }

  async function doSimpleAction(action: Action) {
    setFormError(null)
    setPending(action)
    try {
      const { ok, message } = await dispatch(action)
      const copy = ACTION_COPY[action]
      if (ok) {
        toast.success(copy.success, { description: copy.description })
        setOpenDialog(null)
        router.refresh()
      } else {
        const msg = message ?? "Action failed."
        setFormError(msg)
        toast.error(copy.failTitle, { description: msg })
      }
    } catch {
      const msg = "Network error. Please try again."
      setFormError(msg)
      toast.error("Network error", { description: msg })
    } finally {
      setPending(null)
    }
  }

  const rejectForm = useForm({
    defaultValues: { reasonCode: "", rejectionReason: "", revisionNotes: "" } as RejectApplicationFormValues,
    validators: { onSubmit: rejectApplicationSchema },
    onSubmit: async ({ value }) => {
      setFormError(null)
      const { ok, message } = await dispatch("reject", {
        reasonCode     : value.reasonCode,
        rejectionReason: value.rejectionReason.trim() || undefined,
        revisionNotes  : value.revisionNotes.trim() || undefined,
      })
      if (ok) {
        toast.success("Application rejected", {
          description: "The vendor has been notified and can resubmit after corrections.",
        })
        setOpenDialog(null)
        rejectForm.reset()
        router.refresh()
      } else {
        const msg = message ?? "Failed to reject."
        setFormError(msg)
        toast.error("Rejection failed", { description: msg })
      }
    },
  })

  const revisionForm = useForm({
    defaultValues: { reasonCode: "", rejectionReason: "", revisionNotes: "" } as NeedsRevisionFormValues,
    validators: { onSubmit: needsRevisionSchema },
    onSubmit: async ({ value }) => {
      setFormError(null)
      const { ok, message } = await dispatch("needs-revision", {
        reasonCode     : value.reasonCode,
        rejectionReason: value.rejectionReason.trim() || undefined,
        revisionNotes  : value.revisionNotes.trim() || undefined,
      })
      if (ok) {
        toast.success("Revision requested", {
          description: "The vendor can now edit and resubmit their application.",
        })
        setOpenDialog(null)
        revisionForm.reset()
        router.refresh()
      } else {
        const msg = message ?? "Failed to request revision."
        setFormError(msg)
        toast.error("Request failed", { description: msg })
      }
    },
  })

  // ── Reassign / Escalate — share the same eligible-reviewers lookup,
  // just against a different capability (?for=reassign vs ?for=escalate).
  // Fetched lazily when a dialog actually opens, not on every page load.
  const [reviewers, setReviewers]           = useState<EligibleReviewer[] | null>(null)
  const [reviewersLoading, setReviewersLoading] = useState(false)
  const [targetAdminId, setTargetAdminId]   = useState("")
  const [reassignReason, setReassignReason] = useState("")
  const [escalateReason, setEscalateReason] = useState("")

  useEffect(() => {
    if (openDialog !== "reassign" && openDialog !== "escalate") return
    // An open (unclaimed) escalation can only go to admins who receive
    // escalations, even via the plain Reassign dialog — mirrors the
    // backend's isOpenEscalationPool rule.
    const wantsEscalationReceivers = openDialog === "escalate" || isOpenEscalation
    setReviewers(null)
    setReviewersLoading(true)
    fetch(`/api/vendors/applications/${applicationId}/eligible-reviewers?for=${wantsEscalationReceivers ? "escalate" : "reassign"}`)
      .then((res) => res.json())
      .then((data) => setReviewers(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []))
      .catch(() => setReviewers([]))
      .finally(() => setReviewersLoading(false))
  }, [openDialog, applicationId, isOpenEscalation])

  async function submitReassign() {
    if (!targetAdminId) { setFormError("Select a reviewer to reassign to."); return }
    setFormError(null)
    setPending("reassign")
    const { ok, message } = await dispatch("reassign", { targetAdminId, reason: reassignReason.trim() || undefined })
    if (ok) {
      toast.success("Application reassigned")
      closeDialog()
      router.refresh()
    } else {
      const msg = message ?? "Failed to reassign."
      setFormError(msg)
      toast.error("Reassign failed", { description: msg })
    }
    setPending(null)
  }

  async function submitEscalate() {
    if (!escalateReason.trim()) { setFormError("A reason is required to escalate."); return }
    setFormError(null)
    setPending("escalate")
    const { ok, message } = await dispatch("escalate", {
      reason: escalateReason.trim(),
      targetAdminId: targetAdminId || undefined,
    })
    if (ok) {
      toast.success("Application escalated", {
        description: targetAdminId
          ? "The selected reviewer has been notified."
          : "It's now open for any admin who handles escalations to pick up.",
      })
      closeDialog()
      router.refresh()
    } else {
      const msg = message ?? "Failed to escalate."
      setFormError(msg)
      toast.error("Escalation failed", { description: msg })
    }
    setPending(null)
  }

  const canAct = ACTIVE_STATUSES.includes(currentStatus)
  if (!canAct || (!canReview && !canReassign && !canEscalate)) return null

  function closeDialog() {
    setOpenDialog(null)
    setFormError(null)
    setTargetAdminId("")
    setReassignReason("")
    setEscalateReason("")
    rejectForm.reset()
    revisionForm.reset()
  }

  const canClaimEscalation = canReceiveEscalation && isOpenEscalation && !isEscalatedByMe
  const canClaimNormally   = canClaim && isUnclaimed && !isEscalated && currentStatus === "SUBMITTED"
  const canEscalateNow     = canEscalate && isClaimedByMe && !isEscalated
  // Server-side eligibility (who the target can be) narrows further once
  // the reassign dialog is open — this just decides whether the button
  // itself shows at all. An escalator can never reassign their own
  // escalated application (assertReviewerOwnership blocks it), so hide it.
  const canReassignNow     = canReassign && !isEscalatedByMe

  return (
    <div className="admin-card space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Decision</h2>

      {/* Permanent lock-out — you escalated this, you can't act on it again */}
      {isEscalatedByMe && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-bg px-3.5 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="text-xs font-medium text-warning">You escalated this application</p>
            <p className="text-xs text-muted-foreground">
              It&apos;s with {assignedReviewerName ? assignedReviewerName : "the receiving team"} now — you can no longer review it.
            </p>
          </div>
        </div>
      )}

      {/* Claimed by someone else (not an escalation handoff) */}
      {!isEscalatedByMe && isClaimedByOther && !isOpenEscalation && (
        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-3.5 py-3">
          <UserX className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Assigned to {assignedReviewerName ?? "another reviewer"}. Only they can act on it unless it&apos;s reassigned.
          </p>
        </div>
      )}

      {/* Escalated and assigned to a specific receiver (not you) */}
      {!isEscalatedByMe && isEscalated && isClaimedByOther && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-bg px-3.5 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-xs text-muted-foreground">
            Escalated by {escalatedByAdminName ?? "another admin"}, now assigned to {assignedReviewerName ?? "a reviewer"}.
            {escalationReason && <span className="mt-1 block italic">&ldquo;{escalationReason}&rdquo;</span>}
          </p>
        </div>
      )}

      {/* Escalated, open pool — unclaimed, waiting for a receiver */}
      {!isEscalatedByMe && isOpenEscalation && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-bg px-3.5 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="text-xs font-medium text-warning">
              Escalated by {escalatedByAdminName ?? "another admin"} — open for pickup
            </p>
            {escalationReason && <p className="text-xs italic text-muted-foreground">&ldquo;{escalationReason}&rdquo;</p>}
            {!canReceiveEscalation && (
              <p className="text-xs text-muted-foreground">Only country-scoped admins who handle escalations for this country can claim it — a globally-scoped admin can reassign it directly instead.</p>
            )}
          </div>
        </div>
      )}

      {canClaimEscalation && (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-2 rounded-xl border-warning/40 text-warning hover:-translate-y-px hover:bg-warning-bg"
          disabled={pending !== null}
          onClick={() => doSimpleAction("claim")}
        >
          <UserCheck className="h-4 w-4" />
          {pending === "claim" ? "Claiming…" : "Claim Escalated Application"}
        </Button>
      )}

      {canClaimNormally && (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-2 rounded-xl border-primary/40 text-primary hover:-translate-y-px hover:bg-primary/5"
          disabled={pending !== null}
          onClick={() => doSimpleAction("claim")}
        >
          <UserCheck className="h-4 w-4" />
          {pending === "claim" ? "Claiming…" : "Claim Application"}
        </Button>
      )}

      {isClaimedByMe && !isEscalatedByMe && (
        <>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserCheck className="h-3.5 w-3.5 text-primary" />
            Assigned to you
          </p>

          <div className="flex flex-col gap-2">
            {canReview && currentStatus === "SUBMITTED" && (
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2 rounded-xl hover:-translate-y-px"
                disabled={pending !== null}
                onClick={() => doSimpleAction("review")}
              >
                <Clock className="h-4 w-4" />
                {pending === "review" ? "Saving…" : "Mark Under Review"}
              </Button>
            )}

            {canReview && (
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2 rounded-xl border-warning/40 text-warning hover:-translate-y-px hover:bg-warning-bg"
                disabled={pending !== null}
                onClick={() => setOpenDialog("revision")}
              >
                <AlertTriangle className="h-4 w-4" />
                Request Revision
              </Button>
            )}

            {canApprove && (
              <Button
                type="button"
                className="w-full justify-start gap-2 rounded-xl shadow-sm hover:-translate-y-px"
                style={{
                  backgroundImage: allDocsApproved
                    ? "linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 82%, black 12%))"
                    : undefined,
                }}
                disabled={pending !== null || !allDocsApproved}
                title={!allDocsApproved ? "All documents must be approved before approving the application" : undefined}
                onClick={() => setOpenDialog("approve")}
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve Application
              </Button>
            )}

            {canReject && (
              <Button
                type="button"
                variant="destructive"
                className="w-full justify-start gap-2 rounded-xl hover:-translate-y-px"
                disabled={pending !== null}
                onClick={() => setOpenDialog("reject")}
              >
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            )}

            {canEscalateNow && (
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2 rounded-xl border-warning/40 text-warning hover:-translate-y-px hover:bg-warning-bg"
                disabled={pending !== null}
                onClick={() => setOpenDialog("escalate")}
              >
                <TriangleAlert className="h-4 w-4" />
                Escalate
              </Button>
            )}
          </div>
        </>
      )}

      {canReassignNow && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 rounded-xl text-muted-foreground hover:-translate-y-px hover:text-foreground"
          disabled={pending !== null}
          onClick={() => setOpenDialog("reassign")}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          Reassign
        </Button>
      )}

      {isClaimedByMe && !isEscalatedByMe && canApprove && !allDocsApproved && (
        <p className="text-xs text-muted-foreground">
          All documents must be approved before this application can be approved.
        </p>
      )}

      {/* Approve confirmation */}
      <AlertDialog open={openDialog === "approve"} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-primary h-11 w-11">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Approve this application?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates the vendor account immediately and lets them start onboarding outlets. This can&apos;t be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={closeDialog} disabled={pending !== null}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-full gap-1.5 shadow-sm"
              style={{ backgroundImage: "linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 82%, black 12%))" }}
              disabled={pending !== null}
              onClick={() => doSimpleAction("approve")}
            >
              {pending === "approve" && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending === "approve" ? "Approving…" : "Approve Application"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject confirmation + reason form */}
      <AlertDialog open={openDialog === "reject"} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-danger h-11 w-11">
              <XCircle className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Reject this application</AlertDialogTitle>
            <AlertDialogDescription>
              The vendor will be notified with the reason below and can resubmit after corrections.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form
            id="reject-form"
            onSubmit={(e) => { e.preventDefault(); rejectForm.handleSubmit() }}
            className="space-y-3"
          >
            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <rejectForm.Field name="reasonCode" validators={{ onBlur: rejectApplicationSchema.shape.reasonCode }}>
              {(field) => (
                <ReasonSelect
                  label="Reason *"
                  value={field.state.value}
                  onChange={field.handleChange}
                  reasons={rejectReasons}
                  error={field.state.meta.errors[0]}
                />
              )}
            </rejectForm.Field>

            <rejectForm.Field name="rejectionReason">
              {(field) => (
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="rejectionReason">Details (optional)</Label>
                  <Input
                    id="rejectionReason"
                    placeholder="e.g. Registration document does not match business name"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className="rounded-xl text-sm"
                  />
                </div>
              )}
            </rejectForm.Field>

            <rejectForm.Field name="revisionNotes">
              {(field) => (
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="revisionNotes">Internal notes (optional)</Label>
                  <Textarea
                    id="revisionNotes"
                    placeholder="Context for other reviewers — not shown to the vendor"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="min-h-20 text-sm"
                  />
                </div>
              )}
            </rejectForm.Field>
          </form>

          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={closeDialog}>
              Cancel
            </Button>
            <rejectForm.Subscribe selector={(s) => ({ isSubmitting: s.isSubmitting })}>
              {({ isSubmitting }) => (
                <Button type="submit" form="reject-form" variant="destructive" className="rounded-full gap-1.5" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? "Rejecting…" : "Confirm Reject"}
                </Button>
              )}
            </rejectForm.Subscribe>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Needs-revision confirmation + reason form */}
      <AlertDialog open={openDialog === "revision"} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-warning h-11 w-11">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Request revision</AlertDialogTitle>
            <AlertDialogDescription>
              Sends the application back to the vendor for edits. They can resubmit once corrected.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form
            id="revision-form"
            onSubmit={(e) => { e.preventDefault(); revisionForm.handleSubmit() }}
            className="space-y-3"
          >
            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <revisionForm.Field name="reasonCode" validators={{ onBlur: needsRevisionSchema.shape.reasonCode }}>
              {(field) => (
                <ReasonSelect
                  label="Reason *"
                  value={field.state.value}
                  onChange={field.handleChange}
                  reasons={revisionReasons}
                  error={field.state.meta.errors[0]}
                />
              )}
            </revisionForm.Field>

            <revisionForm.Field name="rejectionReason">
              {(field) => (
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="revision-reason">Details (optional)</Label>
                  <Input
                    id="revision-reason"
                    placeholder="e.g. Tax document is illegible"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className="rounded-xl text-sm"
                  />
                </div>
              )}
            </revisionForm.Field>

            <revisionForm.Field name="revisionNotes">
              {(field) => (
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="revision-notes">What should the vendor fix? (optional)</Label>
                  <Textarea
                    id="revision-notes"
                    placeholder="Shown to the vendor alongside the reason"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="min-h-20 text-sm"
                  />
                </div>
              )}
            </revisionForm.Field>
          </form>

          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={closeDialog}>
              Cancel
            </Button>
            <revisionForm.Subscribe selector={(s) => ({ isSubmitting: s.isSubmitting })}>
              {({ isSubmitting }) => (
                <Button
                  type="submit"
                  form="revision-form"
                  className="rounded-full gap-1.5 border border-warning/40 bg-warning-bg text-warning hover:bg-warning-bg/80"
                  disabled={isSubmitting}
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? "Sending…" : "Send Revision Request"}
                </Button>
              )}
            </revisionForm.Subscribe>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reassign — pick a new eligible reviewer */}
      <AlertDialog open={openDialog === "reassign"} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-primary h-11 w-11">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Reassign application</AlertDialogTitle>
            <AlertDialogDescription>
              {isOpenEscalation
                ? "Choose an admin who receives escalations to hand this off to."
                : "Choose another eligible reviewer to take over this application."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <ReviewerSelect
            reviewers={reviewers}
            loading={reviewersLoading}
            value={targetAdminId}
            onChange={setTargetAdminId}
          />

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="reassign-reason">Note (optional)</Label>
            <Input
              id="reassign-reason"
              placeholder="Context for the new reviewer"
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              className="rounded-xl text-sm"
            />
          </div>

          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={closeDialog} disabled={pending !== null}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-full gap-1.5"
              disabled={pending !== null || !targetAdminId}
              onClick={submitReassign}
            >
              {pending === "reassign" && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending === "reassign" ? "Reassigning…" : "Confirm Reassign"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Escalate — reason required, target optional (open pool if omitted) */}
      <AlertDialog open={openDialog === "escalate"} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-warning h-11 w-11">
              <TriangleAlert className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Escalate this application</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll lose the ability to act on it — it goes to the reviewer you pick, or into an open pool
              for any admin who handles escalations to pick up.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="escalate-reason">Reason *</Label>
            <Textarea
              id="escalate-reason"
              placeholder="Why does this need higher-level attention?"
              value={escalateReason}
              onChange={(e) => setEscalateReason(e.target.value)}
              className="min-h-20 text-sm"
            />
          </div>

          <ReviewerSelect
            reviewers={reviewers}
            loading={reviewersLoading}
            value={targetAdminId}
            onChange={setTargetAdminId}
            label="Escalate to (optional — leave blank for open pool)"
            optional
          />

          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={closeDialog} disabled={pending !== null}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-full gap-1.5 border border-warning/40 bg-warning-bg text-warning hover:bg-warning-bg/80"
              disabled={pending !== null || !escalateReason.trim()}
              onClick={submitEscalate}
            >
              {pending === "escalate" && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending === "escalate" ? "Escalating…" : "Confirm Escalate"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ReviewerSelect({
  reviewers, loading, value, onChange, label = "Reviewer *", optional = false,
}: {
  reviewers?: EligibleReviewer[] | null
  loading   : boolean
  value     : string
  onChange  : (value: string) => void
  label?    : string
  optional? : boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger
          className="w-full rounded-xl text-sm"
          style={{ backgroundColor: "var(--input)", color: "var(--foreground)" }}
        >
          <SelectValue placeholder={
            loading ? "Loading eligible reviewers…"
              : reviewers?.length ? "Select a reviewer…"
              : optional ? "No one eligible — leave blank for open pool"
              : "No eligible reviewers found"
          } />
        </SelectTrigger>
        <SelectContent
          className="rounded-xl"
          style={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)" }}
        >
          {reviewers?.map((r) => (
            <SelectItem key={r.id} value={r.id} className="rounded-lg">
              {r.firstName} {r.lastName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ReasonSelect({
  label, value, onChange, reasons, error,
}: {
  label   : string
  value   : string
  onChange: (value: string) => void
  reasons?: AdminActionReason[]
  error?  : unknown
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger
          className="w-full rounded-xl text-sm"
          style={{ backgroundColor: "var(--input)", color: "var(--foreground)" }}
        >
          <SelectValue placeholder={reasons ? "Select a reason…" : "Loading reasons…"} />
        </SelectTrigger>
        <SelectContent
          className="rounded-xl"
          style={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)" }}
        >
          {reasons?.map((reason) => (
            <SelectItem key={reason.code} value={reason.code} className="rounded-lg">
              {reason.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error != null && (
        <p className="text-xs text-destructive">{getFieldError(error)}</p>
      )}
    </div>
  )
}
