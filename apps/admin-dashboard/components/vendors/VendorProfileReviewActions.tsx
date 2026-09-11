"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, ThumbsUp, Undo2 } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from "@repo/ui/components/alert-dialog"
import type { VendorProfileAdminDetail } from "@/types"

/*
 * The decision itself, on the detail page where the evidence is.
 *
 * "Send back for revision" is the same mechanism as the old Reject — one
 * required reason, the vendor notified with it, and the profile taken offline
 * if it was live — but the framing matters, because that is genuinely what
 * happens next: the vendor's next edit to a screened field clears the reason
 * and re-runs screening automatically, so it re-enters review with no admin
 * action. Calling that "rejected" told the vendor their profile was finished
 * when it was actually waiting on them. Same one-mechanism-two-framings choice
 * the document review already made.
 *
 * The reason box is pre-filled from the flags rather than left blank: the
 * moderator is looking at the detected problems, and retyping them by hand is
 * how a vendor ends up with "inappropriate content" and no idea which field.
 */

interface Props {
  profile: VendorProfileAdminDetail
  /** VENDORS_PROFILES_MODERATE */
  canModerate: boolean
  /** A sentence per detected flag, used to seed the reason box. */
  suggestedReason: string
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : body ? JSON.stringify(body) : undefined,
  })
  return { ok: res.ok, data: await res.json() }
}

export function VendorProfileReviewActions({ profile, canModerate, suggestedReason }: Props) {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [reason, setReason]   = useState("")
  const [pending, setPending] = useState(false)

  if (!canModerate) {
    return (
      <p className="text-sm text-muted-foreground">
        You can view this profile but not moderate it.
      </p>
    )
  }

  const alreadyApproved = profile.reviewStatus === "MANUALLY_APPROVED"
  const alreadySentBack = profile.reviewStatus === "MANUALLY_REJECTED"

  async function doApprove() {
    setPending(true)
    const { ok, data } = await postJson(`/api/vendors/profiles/${profile.vendorAccountId}/approve`)
    if (ok) { toast.success("Profile approved"); router.refresh() }
    else toast.error("Couldn't approve", { description: data.message })
    setPending(false)
  }

  async function doSendBack() {
    if (!reason.trim()) { toast.error("Tell the vendor what to change"); return }
    setPending(true)
    const { ok, data } = await postJson(
      `/api/vendors/profiles/${profile.vendorAccountId}/reject`,
      { reason: reason.trim() },
    )
    if (ok) { toast.success("Sent back to the vendor"); setOpen(false); router.refresh() }
    else toast.error("Couldn't send it back", { description: data.message })
    setPending(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        className="gap-1.5 rounded-full"
        disabled={pending || alreadyApproved}
        onClick={doApprove}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
        {alreadyApproved ? "Approved" : "Approve"}
      </Button>

      <Button
        type="button"
        variant="outline"
        className="gap-1.5 rounded-full"
        disabled={pending || alreadySentBack}
        onClick={() => { setReason(suggestedReason); setOpen(true) }}
      >
        <Undo2 className="h-4 w-4" />
        {alreadySentBack ? "Awaiting the vendor" : "Send back for revision"}
      </Button>

      {alreadySentBack && (
        <span className="text-xs text-muted-foreground">
          It returns here automatically once they edit it.
        </span>
      )}

      <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-warning h-11 w-11"><Undo2 className="h-5 w-5" /></div>
            <AlertDialogTitle>Send back for revision</AlertDialogTitle>
            <AlertDialogDescription>
              {profile.displayName} stays off the marketplace until this is fixed, and comes offline now if it
              is live. The vendor is notified with exactly the message below, so name the field and what to
              change.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label className="text-xs">What the vendor needs to change *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Which field, what is wrong with it, and what would be acceptable…"
              className="min-h-28 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              This is the whole message they receive. Editing any flagged field re-runs the checks and brings
              it back to this queue.
            </p>
          </div>

          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" className="gap-1.5 rounded-full" disabled={pending} onClick={doSendBack}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? "Sending…" : "Send back"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
