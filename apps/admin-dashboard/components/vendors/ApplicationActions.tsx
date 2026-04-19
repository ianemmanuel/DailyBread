"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { Button } from "@repo/ui/components/button"
import { Label } from "@repo/ui/components/label"
import { Input } from "@repo/ui/components/input"
import { Textarea } from "@repo/ui/components/textarea"
import {
  rejectApplicationSchema,
  type RejectApplicationFormValues,
} from "@/lib/validations/vendor"
import { getFieldError } from "@/lib/forms/form-helpers"

interface Props {
  applicationId  : string
  currentStatus  : string
  allDocsApproved: boolean
}

export function ApplicationActions({ applicationId, currentStatus, allDocsApproved }: Props) {
  const router = useRouter()

  // ── All hooks must be declared unconditionally before any early return ──────
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [actionError,    setActionError]    = useState<string | null>(null)
  const [rejectError,    setRejectError]    = useState<string | null>(null)
  const [pendingAction,  setPendingAction]  = useState<"review" | "approve" | null>(null)

  const rejectForm = useForm({
    defaultValues: {
      rejectionReason: "",
      revisionNotes  : "",
    } as RejectApplicationFormValues,
    validators: { onSubmit: rejectApplicationSchema },
    onSubmit: async ({ value }) => {
      setRejectError(null)
      const { ok, message } = await dispatch("reject", {
        rejectionReason: value.rejectionReason,
        revisionNotes  : value.revisionNotes.trim() || undefined,
      })
      if (ok) {
        toast.success("Application rejected", {
          description: "The vendor has been notified and can resubmit after corrections.",
        })
        router.refresh()
        setShowRejectForm(false)
      } else {
        const msg = message ?? "Failed to reject."
        setRejectError(msg)
        toast.error("Rejection failed", { description: msg })
      }
    },
  })

  // ── Guard renders null AFTER all hooks ──────────────────────────────────────
  // Previously this was before hooks which caused "rendered fewer hooks" on status change
  const canAct = currentStatus === "SUBMITTED" || currentStatus === "UNDER_REVIEW"
  if (!canAct) return null

  async function dispatch(
    action: "review" | "approve" | "reject",
    body?: object,
  ): Promise<{ ok: boolean; message?: string }> {
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

  async function doSimpleAction(action: "review" | "approve") {
    setActionError(null)
    setPendingAction(action)
    try {
      const { ok, message } = await dispatch(action)
      if (ok) {
        toast.success(
          action === "approve" ? "Application approved" : "Marked as under review",
          {
            description: action === "approve"
              ? "The vendor account has been created successfully."
              : "The application has been moved to Under Review.",
          },
        )
        router.refresh()
      } else {
        const msg = message ?? "Action failed."
        setActionError(msg)
        toast.error(action === "approve" ? "Approval failed" : "Action failed", {
          description: msg,
        })
      }
    } catch {
      const msg = "Network error. Please try again."
      setActionError(msg)
      toast.error("Network error", { description: msg })
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="flex flex-col items-end gap-3">
      {actionError && <p className="text-xs text-destructive">{actionError}</p>}

      {!showRejectForm ? (
        <div className="flex flex-wrap justify-end gap-2">
          {currentStatus === "SUBMITTED" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pendingAction !== null}
              onClick={() => doSimpleAction("review")}
            >
              {pendingAction === "review" ? "Saving…" : "Mark Under Review"}
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            disabled={pendingAction !== null || !allDocsApproved}
            title={
              !allDocsApproved
                ? "All documents must be approved before approving the application"
                : undefined
            }
            onClick={() => doSimpleAction("approve")}
          >
            {pendingAction === "approve" ? "Approving…" : "Approve Application"}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pendingAction !== null}
            onClick={() => setShowRejectForm(true)}
          >
            Reject
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); rejectForm.handleSubmit() }}
          className="w-full max-w-sm space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="text-sm font-semibold text-destructive">Reject Application</p>

          {rejectError && (
            <p className="text-xs text-destructive">{rejectError}</p>
          )}

          <rejectForm.Field
            name="rejectionReason"
            validators={{ onBlur: rejectApplicationSchema.shape.rejectionReason }}
          >
            {(field) => (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="rejectionReason">Reason *</Label>
                <Input
                  id="rejectionReason"
                  placeholder="e.g. Incomplete or unverifiable documents"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  className="text-sm"
                />
                {field.state.meta.errors[0] && (
                  <p className="text-xs text-destructive">{getFieldError(field.state.meta.errors[0])}</p>
                )}
              </div>
            )}
          </rejectForm.Field>

          <rejectForm.Field name="revisionNotes">
            {(field) => (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="revisionNotes">Revision notes (optional)</Label>
                <Textarea
                  id="revisionNotes"
                  placeholder="What should the vendor fix before resubmitting?"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="min-h-20 text-sm"
                />
              </div>
            )}
          </rejectForm.Field>

          <rejectForm.Subscribe selector={(s) => ({ isSubmitting: s.isSubmitting })}>
            {({ isSubmitting }) => (
              <div className="flex gap-2">
                <Button type="submit" size="sm" variant="destructive" disabled={isSubmitting}>
                  {isSubmitting ? "Rejecting…" : "Confirm Reject"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowRejectForm(false)
                    setRejectError(null)
                    rejectForm.reset()
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </rejectForm.Subscribe>
        </form>
      )}
    </div>
  )
}