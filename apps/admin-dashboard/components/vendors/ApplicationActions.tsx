"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "@tanstack/react-form"
import { Button } from "@repo/ui/components/button"
import { Label } from "@repo/ui/components/label"
import { Input } from "@repo/ui/components/input"
import { Textarea } from "@repo/ui/components/textarea"
import { rejectApplicationSchema } from "@/lib/validations/vendor"
import { getFieldError } from "@/lib/forms/form-helpers"

interface Props {
  applicationId : string
  currentStatus : string
}

export function ApplicationActions({ applicationId, currentStatus }: Props) {
  const router                              = useRouter()
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [actionError,    setActionError]    = useState<string | null>(null)
  const [isPending, startTransition]        = useTransition()

  const canAct = currentStatus === "SUBMITTED" || currentStatus === "UNDER_REVIEW"
  if (!canAct) return null

  async function doSimpleAction(action: "review" | "approve") {
    setActionError(null)
    startTransition(async () => {
      const res = await fetch(`/api/admin/vendors/applications/${applicationId}/${action}`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json()
        setActionError(data.message ?? "Action failed.")
      }
    })
  }

  const rejectForm = useForm({
    defaultValues: { rejectionReason: "", revisionNotes: "" },
    validators   : { onSubmit: rejectApplicationSchema },
    onSubmit: async ({ value }) => {
      const res = await fetch(`/api/admin/vendors/applications/${applicationId}/reject`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify(value),
      })
      if (res.ok) {
        router.refresh()
        setShowRejectForm(false)
      } else {
        const data = await res.json()
        rejectForm.setErrorMap({ onSubmit: data.message ?? "Failed to reject." })
      }
    },
  })

  return (
    <div className="flex flex-col items-end gap-3">
      {actionError && <p className="text-xs text-destructive">{actionError}</p>}

      {!showRejectForm ? (
        <div className="flex flex-wrap justify-end gap-2">
          {currentStatus === "SUBMITTED" && (
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => doSimpleAction("review")}>
              Mark Under Review
            </Button>
          )}
          <Button size="sm" disabled={isPending} onClick={() => doSimpleAction("approve")}>
            {isPending ? "Approving…" : "Approve"}
          </Button>
          <Button size="sm" variant="destructive" disabled={isPending} onClick={() => setShowRejectForm(true)}>
            Reject
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); rejectForm.handleSubmit() }}
          className="w-full max-w-sm space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="text-sm font-semibold text-destructive">Reject Application</p>

          <rejectForm.Subscribe selector={(s) => s.errorMap.onSubmit}>
            {(err) => err ? (
              <p className="text-xs text-destructive">{getFieldError(err)}</p>
            ) : null}
          </rejectForm.Subscribe>

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
                <Button size="sm" variant="destructive" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Rejecting…" : "Confirm Reject"}
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setShowRejectForm(false)}>
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