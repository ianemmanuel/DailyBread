"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, ThumbsUp, Undo2, ShieldAlert, Ban, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import type { AdminMealDetail } from "@/types"

/*
 * Two independent axes, never collapsed into one control.
 *
 *   Review — a verdict about the words: approve, or send back for revision.
 *   Status — the platform's operational call: suspend, ban, reinstate.
 *
 * Sending a meal back does NOT suspend it, and suspending one does NOT mark it
 * rejected. Same rule outlet moderation follows, and it matters here because
 * the two answer different questions: "is this description acceptable" and "may
 * this dish be sold at all" have different answers and different remedies.
 *
 * "Send back for revision" rather than "reject", because that is genuinely what
 * happens next: the vendor edits, screening re-runs, and it returns to this
 * queue with no admin action.
 */

interface Props {
  meal       : AdminMealDetail
  canModerate: boolean
  /** Seeded into the reason box from the detected flags. */
  suggestedReason: string
}

type Dialog = null | "send-back" | "suspend" | "ban"

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : body ? JSON.stringify(body) : "{}",
  })
  return { ok: res.ok, data: await res.json().catch(() => ({})) }
}

export function MealModerationActions({ meal, canModerate, suggestedReason }: Props) {
  const router = useRouter()
  const [dialog, setDialog]   = useState<Dialog>(null)
  const [reason, setReason]   = useState("")
  const [pending, setPending] = useState(false)

  if (!canModerate) {
    return <p className="text-sm text-muted-foreground">You can view this meal but not moderate it.</p>
  }

  const base = `/api/vendors/meals/${meal.id}`

  async function run(url: string, body: unknown, success: string) {
    setPending(true)
    const { ok, data } = await post(url, body)
    if (ok) { toast.success(success); setDialog(null); router.refresh() }
    else toast.error(data.message ?? "Something went wrong")
    setPending(false)
  }

  const approved  = meal.reviewStatus === "MANUALLY_APPROVED"
  const sentBack  = meal.reviewStatus === "MANUALLY_REJECTED"
  const suspended = meal.adminStatus === "SUSPENDED"
  const banned    = meal.adminStatus === "BANNED"

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Content review</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            className="gap-1.5 rounded-full"
            disabled={pending || approved}
            onClick={() => run(`${base}/approve`, undefined, "Meal approved")}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
            {approved ? "Approved" : "Approve"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-1.5 rounded-full"
            disabled={pending || sentBack}
            onClick={() => { setReason(suggestedReason); setDialog("send-back") }}
          >
            <Undo2 className="h-4 w-4" />
            {sentBack ? "Awaiting the vendor" : "Send back for revision"}
          </Button>
        </div>
        {sentBack && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            It returns here automatically once they edit it.
          </p>
        )}
      </div>

      <div className="border-t border-border/70 pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Marketplace status</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(suspended || banned) && (
            <Button
              type="button"
              variant="outline"
              className="gap-1.5 rounded-full"
              disabled={pending}
              onClick={() => run(`${base}/status`, { status: "ACTIVE" }, "Meal reinstated")}
            >
              <RotateCcw className="h-4 w-4" />
              Reinstate
            </Button>
          )}
          {!suspended && !banned && (
            <Button
              type="button"
              variant="outline"
              className="gap-1.5 rounded-full text-warning hover:text-warning"
              disabled={pending}
              onClick={() => { setReason(""); setDialog("suspend") }}
            >
              <ShieldAlert className="h-4 w-4" />
              Suspend
            </Button>
          )}
          {!banned && (
            <Button
              type="button"
              variant="outline"
              className="gap-1.5 rounded-full text-destructive hover:text-destructive"
              disabled={pending}
              onClick={() => { setReason(""); setDialog("ban") }}
            >
              <Ban className="h-4 w-4" />
              Ban
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Separate from the content verdict. Suspending is reversible; a ban also blocks the vendor from
          editing it.
        </p>
      </div>

      <AlertDialog open={dialog !== null} onOpenChange={(o) => !pending && !o && setDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog === "send-back" && "Send back for revision"}
              {dialog === "suspend"   && `Suspend ${meal.name}?`}
              {dialog === "ban"       && `Ban ${meal.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog === "send-back" && (
                <>
                  {meal.name} stays off the menu until it is fixed. The vendor is notified with exactly the
                  message below, so name what is wrong and what would be acceptable.
                </>
              )}
              {dialog === "suspend" && (
                <>
                  Takes the dish off the marketplace at every location. The vendor can still edit it, and you
                  can reinstate it at any time.
                </>
              )}
              {dialog === "ban" && (
                <>
                  Removes the dish permanently and blocks the vendor from editing it. Use suspend if there is
                  any chance this is recoverable.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label className="text-xs">
              {dialog === "send-back" ? "What the vendor needs to change *" : "Reason *"}
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-24 text-sm"
              placeholder={
                dialog === "send-back"
                  ? "Which field, what is wrong with it, and what would be acceptable…"
                  : "Recorded in the audit trail."
              }
            />
          </div>

          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setDialog(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-1.5 rounded-full"
              variant={dialog === "ban" ? "destructive" : "default"}
              disabled={pending || !reason.trim()}
              onClick={() => {
                if (dialog === "send-back") return run(`${base}/send-back`, { reason: reason.trim() }, "Sent back to the vendor")
                if (dialog === "suspend")   return run(`${base}/status`, { status: "SUSPENDED", reason: reason.trim() }, "Meal suspended")
                if (dialog === "ban")       return run(`${base}/status`, { status: "BANNED", reason: reason.trim() }, "Meal banned")
              }}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {dialog === "send-back" ? "Send back" : dialog === "suspend" ? "Suspend" : "Ban"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
