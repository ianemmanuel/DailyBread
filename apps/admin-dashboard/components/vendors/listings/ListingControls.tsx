"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, EyeOff, Eye, ShieldAlert, RotateCcw, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import { MealReasonActions, MEAL_REASON_ACTION_LABEL } from "@repo/types/enums"
import { ReasonPicker, EMPTY_REASON, reasonBody, reasonReady, type ReasonValue } from "@/components/meals/ReasonPicker"
import type { MealAdminStatus } from "@/types"

/*
 * Marketplace controls on ONE listing (one dish at one outlet). Two
 * independent controls, never collapsed into one:
 *
 *   Visibility — hide / restore. Quiet; the vendor is not notified.
 *   Suspension — suspend / lift. Enforcement; the vendor is notified.
 *
 * Taking a listing down needs a CONTROLLED reason (ReasonPicker); lifting a
 * control takes only an optional internal note. A city admin with no fitting
 * reason ESCALATES to a country admin instead (they may not use "Other").
 * Neither control touches the vendor's content or their Available/Off switch,
 * and every call sends the state this page was rendered with, so an action on
 * a stale view is refused by the server.
 */

interface Props {
  mealId     : string
  countryId  : string
  dishName   : string
  outletName : string
  adminStatus: MealAdminStatus
  hidden     : boolean
  /** Removed by the vendor: nothing to take down, but controls can be lifted. */
  removed    : boolean
  /** Server-computed: may this admin escalate, and is one already open? */
  canEscalate: boolean
  pendingEscalation: { assignedTo: string; createdAt: string } | null
}

type Action = "hide" | "unhide" | "suspend" | "reinstate"

const SUCCESS: Record<Action, string> = {
  hide     : "Listing hidden",
  unhide   : "Listing visible again",
  suspend  : "Listing suspended",
  reinstate: "Suspension lifted",
}
const REASON_ACTION = {
  hide   : MealReasonActions.LISTING_HIDE,
  suspend: MealReasonActions.LISTING_SUSPEND,
} as const

interface Recipient { id: string; firstName: string; lastName: string }

export function ListingControls(props: Props) {
  const { mealId, countryId, dishName, outletName, adminStatus, hidden, removed, canEscalate, pendingEscalation } = props
  const router = useRouter()
  const [dialog, setDialog]   = useState<Action | null>(null)
  const [reason, setReason]   = useState<ReasonValue>(EMPTY_REASON)
  const [note, setNote]       = useState("")
  const [pending, setPending] = useState(false)

  // Escalation
  const [escOpen, setEscOpen]         = useState(false)
  const [recipients, setRecipients]   = useState<Recipient[] | null>(null)
  const [recipientId, setRecipientId] = useState("")
  const [requested, setRequested]     = useState("")
  const [escNote, setEscNote]         = useState("")

  const suspended  = adminStatus === "SUSPENDED"
  const needsReason = dialog === "hide" || dialog === "suspend"

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify(body),
    })
    return { ok: res.ok, data: await res.json().catch(() => ({})) }
  }

  async function run(action: Action) {
    setPending(true)
    const { ok, data } = await post(`/api/vendors/meals/listings/${mealId}/${action}`, {
      ...(action === "hide" || action === "suspend"
        ? reasonBody(reason)
        : note.trim() ? { internalNote: note.trim() } : {}),
      expectedStatus: adminStatus,
      expectedHidden: hidden,
    })
    if (ok) { toast.success(SUCCESS[action]); setDialog(null); router.refresh() }
    else toast.error(data.message ?? "Something went wrong")
    setPending(false)
  }

  const open = (action: Action) => { setReason(EMPTY_REASON); setNote(""); setDialog(action) }

  async function openEscalate() {
    setEscOpen(true); setRecipientId(""); setRequested(""); setEscNote(""); setRecipients(null)
    const res = await fetch(`/api/meals/listings/${mealId}/escalation-recipients`)
    const d = await res.json().catch(() => ({}))
    if (res.ok) setRecipients(d.data ?? [])
    else { toast.error(d.message ?? "Couldn't load recipients"); setEscOpen(false) }
  }

  async function escalate() {
    setPending(true)
    const { ok, data } = await post(`/api/meals/listings/${mealId}/escalate`, {
      assignedToId: recipientId,
      note        : escNote.trim(),
      ...(requested ? { requestedAction: requested } : {}),
    })
    if (ok) { toast.success("Escalated to a country admin"); setEscOpen(false); router.refresh() }
    else toast.error(data.message ?? "Something went wrong")
    setPending(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Visibility</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {hidden ? (
            <Button type="button" variant="success" className="gap-1.5 rounded-full" disabled={pending} onClick={() => open("unhide")}>
              <Eye className="h-4 w-4" />
              Restore visibility
            </Button>
          ) : (
            <Button type="button" variant="warning" className="gap-1.5 rounded-full" disabled={pending || removed} onClick={() => open("hide")}>
              <EyeOff className="h-4 w-4" />
              Hide listing
            </Button>
          )}
        </div>
      </div>

      <div className="border-t border-border/70 pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Suspension</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {suspended ? (
            <Button type="button" variant="success" className="gap-1.5 rounded-full" disabled={pending} onClick={() => open("reinstate")}>
              <RotateCcw className="h-4 w-4" />
              Lift suspension
            </Button>
          ) : adminStatus === "ACTIVE" ? (
            <Button type="button" variant="warning" className="gap-1.5 rounded-full" disabled={pending || removed} onClick={() => open("suspend")}>
              <ShieldAlert className="h-4 w-4" />
              Suspend listing
            </Button>
          ) : null}
        </div>
      </div>

      {canEscalate && (
        <div className="border-t border-border/70 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">No reason fits?</p>
          {pendingEscalation ? (
            <p className="mt-2 text-sm text-foreground">
              Escalated to <span className="font-medium">{pendingEscalation.assignedTo}</span> on{" "}
              {new Date(pendingEscalation.createdAt).toLocaleDateString()} — waiting on them.
            </p>
          ) : (
            <Button type="button" variant="outline" className="mt-2 gap-1.5 rounded-full" disabled={pending} onClick={openEscalate}>
              <ArrowUpRight className="h-4 w-4" />
              Escalate to a country admin
            </Button>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {removed
          ? "The vendor no longer offers this meal here, so there is nothing to take down. Existing controls can still be lifted, and they stay in place if the vendor adds it back."
          : "Affects this outlet only. The vendor's content and their own Available / Off switch are never changed, and they cannot lift either control themselves. Hiding is quiet; suspending notifies the vendor."}
      </p>

      {/* ── Action dialog ─────────────────────────────────────────── */}
      <AlertDialog open={dialog !== null} onOpenChange={(o) => !pending && !o && setDialog(null)}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog === "hide"      && `Hide ${dishName} at ${outletName}?`}
              {dialog === "unhide"    && `Show ${dishName} at ${outletName} again?`}
              {dialog === "suspend"   && `Suspend ${dishName} at ${outletName}?`}
              {dialog === "reinstate" && `Lift the suspension on ${dishName} at ${outletName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog === "hide" && "Customers stop seeing this listing. The vendor is not notified, and you can restore it at any time."}
              {dialog === "unhide" && "The listing can appear to customers again, subject to everything else that governs it (content review, the outlet, any suspension)."}
              {dialog === "suspend" && "Takes this listing off the marketplace at this outlet and notifies the vendor."}
              {dialog === "reinstate" && "The listing can sell again at this outlet, subject to everything else that governs it. The vendor is notified."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {needsReason && dialog ? (
            <ReasonPicker action={REASON_ACTION[dialog]} countryId={countryId} value={reason} onChange={setReason} />
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">Internal note (optional)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-20 text-sm"
                placeholder="For the audit trail — never shown to the vendor."
              />
            </div>
          )}

          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialog(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-1.5 rounded-full"
              variant={needsReason ? "warning" : "success"}
              disabled={pending || (needsReason && !reasonReady(reason))}
              onClick={() => dialog && run(dialog)}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {dialog === "hide" ? "Hide" : dialog === "unhide" ? "Restore" : dialog === "suspend" ? "Suspend" : "Lift suspension"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Escalation dialog ─────────────────────────────────────── */}
      <AlertDialog open={escOpen} onOpenChange={(o) => !pending && !o && setEscOpen(false)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Escalate {dishName} at {outletName}</AlertDialogTitle>
            <AlertDialogDescription>
              For when no predefined reason fits. A country admin for this country can act with an exception
              reason. Nothing changes on the listing until they do.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {recipients === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
          ) : recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No country admin with meals moderation is available for this country. Raise it with your team lead.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Country admin *</Label>
                <Select value={recipientId} onValueChange={setRecipientId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Choose who to escalate to" /></SelectTrigger>
                  <SelectContent>
                    {recipients.map((r) => <SelectItem key={r.id} value={r.id}>{r.firstName} {r.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">What you would do (optional)</Label>
                <Select value={requested} onValueChange={setRequested}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Just take a look" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MealReasonActions.LISTING_HIDE}>{MEAL_REASON_ACTION_LABEL["meal.hidden"]}</SelectItem>
                    <SelectItem value={MealReasonActions.LISTING_SUSPEND}>{MEAL_REASON_ACTION_LABEL["meal.suspended"]}</SelectItem>
                    <SelectItem value={MealReasonActions.DISH_SUSPEND}>{MEAL_REASON_ACTION_LABEL["menu_item.suspended"]}</SelectItem>
                    <SelectItem value={MealReasonActions.DISH_BAN}>{MEAL_REASON_ACTION_LABEL["menu_item.banned"]}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Why *</Label>
                <Textarea
                  value={escNote}
                  onChange={(e) => setEscNote(e.target.value)}
                  className="min-h-24 text-sm"
                  placeholder="What you saw, and why no standard reason covers it. Internal only."
                />
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setEscOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-1.5 rounded-full"
              disabled={pending || !recipientId || escNote.trim().length < 10}
              onClick={escalate}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Escalate
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
