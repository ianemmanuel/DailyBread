"use client"

import { useEffect, useState } from "react"
import { Loader2, TriangleAlert } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { OTHER_REASON_CODE, OTHER_MIN_LENGTH, type MealReasonAction } from "@repo/types/enums"

/*
 * The reason step of every consequential meal action (send back, hide,
 * suspend, ban). The admin CHOOSES a predefined reason and the vendor
 * explanation comes with it, read-only — they never retype it. "Other" is
 * offered only when the server says this admin may use it (country/global),
 * and then the explanation becomes mandatory editable text.
 *
 * Everything offered is what the backend returned for THIS action in THIS
 * country; the backend validates the submission again regardless.
 */

export interface ReasonValue {
  reasonCode   : string
  vendorMessage: string
  internalNote : string
}

export const EMPTY_REASON: ReasonValue = { reasonCode: "", vendorMessage: "", internalNote: "" }

interface OfferedReason { code: string; label: string; vendorMessage: string }
interface Offer { reasons: OfferedReason[]; canUseOther: boolean; canEscalate: boolean }

/** The request-body fields for a reason-backed action. */
export function reasonBody(v: ReasonValue) {
  return {
    reasonCode: v.reasonCode,
    ...(v.reasonCode === OTHER_REASON_CODE ? { vendorMessage: v.vendorMessage.trim() } : {}),
    ...(v.internalNote.trim() ? { internalNote: v.internalNote.trim() } : {}),
  }
}

/** Whether the dialog may submit — an early hint only; the server decides. */
export function reasonReady(v: ReasonValue): boolean {
  if (!v.reasonCode) return false
  if (v.reasonCode === OTHER_REASON_CODE) return v.vendorMessage.trim().length >= OTHER_MIN_LENGTH
  return true
}

interface Props {
  action   : MealReasonAction
  /** The target's country — decides which country reasons overlay the global ones. */
  countryId: string
  value    : ReasonValue
  onChange : (v: ReasonValue) => void
  /** Called with whether this admin may escalate instead (city admins). */
  onOffer? : (offer: { canEscalate: boolean; empty: boolean }) => void
}

export function ReasonPicker({ action, countryId, value, onChange, onOffer }: Props) {
  const [offer, setOffer] = useState<Offer | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setOffer(null); setError(null)
    fetch(`/api/meals/reasons?action=${encodeURIComponent(action)}&countryId=${encodeURIComponent(countryId)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!live) return
        if (!r.ok) { setError(d.message ?? "Couldn't load action reasons"); return }
        setOffer(d.data)
        onOffer?.({ canEscalate: !!d.data?.canEscalate, empty: (d.data?.reasons ?? []).length === 0 })
      })
      .catch(() => live && setError("Couldn't load action reasons"))
    return () => { live = false }
    // onOffer is a callback prop; re-fetching when its identity changes would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, countryId])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!offer) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading action reasons…
      </p>
    )
  }

  const isOther  = value.reasonCode === OTHER_REASON_CODE
  const selected = offer.reasons.find((r) => r.code === value.reasonCode)

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Reason *</Label>
        {offer.reasons.length === 0 && !offer.canUseOther ? (
          <p className="text-sm text-muted-foreground">No action reason is set up for this action yet.</p>
        ) : (
          <Select
            value={value.reasonCode}
            onValueChange={(code) => onChange({ ...value, reasonCode: code, vendorMessage: "" })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a reason" />
            </SelectTrigger>
            <SelectContent>
              {offer.reasons.map((r) => <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>)}
              {offer.canUseOther && <SelectItem value={OTHER_REASON_CODE}>Other (exception)</SelectItem>}
            </SelectContent>
          </Select>
        )}
      </div>

      {selected && (
        <div className="space-y-1.5">
          <Label className="text-xs">What the vendor is told</Label>
          <p className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm text-foreground">
            {selected.vendorMessage}
          </p>
        </div>
      )}

      {isOther && (
        <div className="space-y-1.5">
          <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-foreground">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            &ldquo;Other&rdquo; is an exception for cases no standard reason covers. It is recorded as such. Write
            the explanation the vendor should read.
          </p>
          <Label className="text-xs">Explanation for the vendor *</Label>
          <Textarea
            value={value.vendorMessage}
            onChange={(e) => onChange({ ...value, vendorMessage: e.target.value })}
            className="min-h-20 text-sm"
            placeholder="What is wrong, and what would make it acceptable…"
          />
          <p className="text-xs text-muted-foreground">At least {OTHER_MIN_LENGTH} characters.</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Internal note (optional)</Label>
        <Textarea
          value={value.internalNote}
          onChange={(e) => onChange({ ...value, internalNote: e.target.value })}
          className="min-h-16 text-sm"
          placeholder="For the audit trail — never shown to the vendor."
        />
      </div>

      {offer.canEscalate && (
        <p className="text-xs text-muted-foreground">
          None of these fits? Close this and use <span className="font-medium">Escalate</span> to hand the listing
          to a country admin.
        </p>
      )}
    </div>
  )
}
