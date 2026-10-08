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
import { MealReasonActions } from "@repo/types/enums"
import { ReasonPicker, EMPTY_REASON, reasonBody, reasonReady, type ReasonValue } from "@/components/meals/ReasonPicker"

/*
 * Two independent axes, never collapsed into one control.
 *
 *   Review — a verdict about the words: approve, or send back for revision.
 *   Status — the platform's operational call: suspend, reinstate, ban, unban.
 *
 * Sending a meal back does NOT suspend it, and suspending one does NOT mark it
 * rejected. Same rule outlet moderation follows, and it matters here because
 * the two answer different questions: "is this description acceptable" and "may
 * this dish be sold at all" have different answers and different remedies.
 *
 * "Send back for revision" rather than "reject", because that is genuinely what
 * happens next: the vendor edits, screening re-runs, and it returns to this
 * queue with no admin action.
 *
 * The status buttons offered are exactly the backend's transitions
 * (mealStatusTransition): a banned meal offers "Lift ban" and nothing else,
 * because a ban is never undone by an ordinary reactivation. Every status call
 * sends the status this page was rendered with, so a decision made on a stale
 * view is refused rather than silently becoming a different act.
 */

interface Props {
  meal       : AdminMealDetail
  canModerate: boolean
}

/** The reason-backed dialogs and the action each one justifies. */
const REASON_ACTION = {
  "send-back": MealReasonActions.DISH_SEND_BACK,
  suspend    : MealReasonActions.DISH_SUSPEND,
  ban        : MealReasonActions.DISH_BAN,
} as const

type Dialog = null | "send-back" | "suspend" | "ban" | "unban"

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : body ? JSON.stringify(body) : "{}",
  })
  return { ok: res.ok, data: await res.json().catch(() => ({})) }
}

export function MealModerationActions({ meal, canModerate }: Props) {
  const router = useRouter()
  const [dialog, setDialog]   = useState<Dialog>(null)
  const [reason, setReason]   = useState<ReasonValue>(EMPTY_REASON)
  const [note, setNote]       = useState("")
  const [pending, setPending] = useState(false)

  if (!canModerate) {
    return <p className="text-sm text-muted-foreground">You can view this dish but not moderate it.</p>
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
  // Server-computed per group. The backend refuses the approve anyway
  // (MODIFIER_GROUP_UNRESOLVED); this only says so before the click.
  const blockingGroups = meal.modifierGroups.filter((g) => g.blocksDish)
  const status = (to: string, extra: Record<string, unknown> = {}) => ({
    status: to, expectedStatus: meal.adminStatus, ...extra,
  })
  const openDialog = (d: Exclude<Dialog, null>) => { setReason(EMPTY_REASON); setNote(""); setDialog(d) }
  const needsReason = dialog === "send-back" || dialog === "suspend" || dialog === "ban"

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Content review</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            className="gap-1.5 rounded-full"
            disabled={pending || approved || blockingGroups.length > 0}
            onClick={() => run(`${base}/approve`, undefined, "Dish approved")}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
            {approved ? "Approved" : "Approve"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-1.5 rounded-full"
            disabled={pending || sentBack}
            onClick={() => openDialog("send-back")}
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
        {!approved && blockingGroups.length > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Resolve {blockingGroups.map((g) => `“${g.name}”`).join(", ")} under the options first — a group&apos;s
            verdict is its own, because other meals can share it.
          </p>
        )}
      </div>

      <div className="border-t border-border/70 pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Marketplace status</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {suspended && (
            <Button
              type="button"
              variant="success"
              className="gap-1.5 rounded-full"
              disabled={pending}
              onClick={() => run(`${base}/status`, status("ACTIVE"), "Dish reinstated")}
            >
              <RotateCcw className="h-4 w-4" />
              Reinstate
            </Button>
          )}
          {banned && (
            <Button
              type="button"
              variant="success"
              className="gap-1.5 rounded-full"
              disabled={pending}
              onClick={() => openDialog("unban")}
            >
              <RotateCcw className="h-4 w-4" />
              Lift ban
            </Button>
          )}
          {!suspended && !banned && (
            <Button
              type="button"
              variant="warning"
              className="gap-1.5 rounded-full"
              disabled={pending}
              onClick={() => openDialog("suspend")}
            >
              <ShieldAlert className="h-4 w-4" />
              Suspend
            </Button>
          )}
          {!banned && (
            <Button
              type="button"
              variant="destructive"
              className="gap-1.5 rounded-full"
              disabled={pending}
              onClick={() => openDialog("ban")}
            >
              <Ban className="h-4 w-4" />
              Ban
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Separate from the content verdict. Suspending is reversible; a ban also blocks the vendor from
          editing it, and only lifting the ban restores it. The vendor is notified either way.
        </p>
      </div>

      <AlertDialog open={dialog !== null} onOpenChange={(o) => !pending && !o && setDialog(null)}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog === "send-back" && "Send back for revision"}
              {dialog === "suspend"   && `Suspend ${meal.name}?`}
              {dialog === "ban"       && `Ban ${meal.name}?`}
              {dialog === "unban"     && `Lift the ban on ${meal.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog === "send-back" && (
                <>
                  {meal.name} stays off the menu at every outlet until it is fixed. The vendor is told the
                  reason&apos;s standard explanation shown below.
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
                  Takes the dish off the marketplace and blocks the vendor from editing it until the ban is
                  lifted. Use suspend if this is likely to be temporary.
                </>
              )}
              {dialog === "unban" && (
                <>
                  The vendor can edit it again and it can sell wherever they offer it, subject to its content
                  review. Recorded in the audit trail as an unban.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {needsReason && dialog ? (
            <ReasonPicker
              action={REASON_ACTION[dialog as keyof typeof REASON_ACTION]}
              countryId={meal.vendor.countryId}
              value={reason}
              onChange={setReason}
            />
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">Internal note (optional)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-24 text-sm"
                placeholder="For the audit trail — never shown to the vendor."
              />
            </div>
          )}

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
              variant={
                dialog === "ban" ? "destructive"
                  : dialog === "suspend" ? "warning"
                  : dialog === "unban" ? "success"
                  : "default"
              }
              disabled={pending || (needsReason && !reasonReady(reason))}
              onClick={() => {
                if (dialog === "send-back") return run(`${base}/send-back`, reasonBody(reason), "Sent back to the vendor")
                if (dialog === "suspend")   return run(`${base}/status`, status("SUSPENDED", reasonBody(reason)), "Dish suspended")
                if (dialog === "ban")       return run(`${base}/status`, status("BANNED", reasonBody(reason)), "Dish banned")
                if (dialog === "unban")     return run(`${base}/status`, status("ACTIVE", note.trim() ? { internalNote: note.trim() } : {}), "Ban lifted")
              }}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {dialog === "send-back" ? "Send back" : dialog === "suspend" ? "Suspend" : dialog === "unban" ? "Lift ban" : "Ban"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
