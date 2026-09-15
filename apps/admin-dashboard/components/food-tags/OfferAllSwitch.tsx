"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Globe2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog"
import type { FoodTagKind } from "@/types/food-tag.types"

/*
 * "Offer every cuisine in Kenya" as one switch.
 *
 * Turning it ON is a convenience, so it confirms first: a launch admin
 * switching on 23 cuisines at once should see the number before it happens.
 * Turning it OFF is confirmed too, and more firmly — it withdraws the whole
 * vocabulary from a live market, and vendors lose those options on their next
 * profile edit.
 *
 * Only ACTIVE catalog entries are ever switched on, matching the per-row rule:
 * a country cannot opt into vocabulary that is suspended platform-wide, so
 * "offer everything" never resurrects an entry an admin deliberately withdrew.
 */

interface Props {
  kind        : FoodTagKind
  countryRef  : string
  countryName : string
  /** ACTIVE entries currently switched on for this country. */
  enabledCount: number
  /** ACTIVE entries in the whole catalog. */
  activeTotal : number
  disabled?   : boolean
}

export function OfferAllSwitch({
  kind, countryRef, countryName, enabledCount, activeTotal, disabled,
}: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState<null | boolean>(null)
  const [saving, setSaving] = useState(false)

  // "All offered" only when every ACTIVE entry is on. An empty catalog is not
  // "all offered" — there is nothing to offer, and showing it on would be a lie.
  const allOffered = activeTotal > 0 && enabledCount >= activeTotal

  async function apply(enabled: boolean) {
    setSaving(true)
    try {
      const res = await fetch(`/api/food-tags/${kind}/countries/${countryRef}/all`, {
        method : "PUT",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ enabled }),
      })
      const body = await res.json()
      if (!res.ok) { toast.error(body.message ?? "Couldn't update"); return }

      const changed = body.data?.changed ?? 0
      toast.success(
        changed === 0
          ? "Nothing to change"
          : enabled
            ? `${changed} now offered in ${countryName}`
            : `${changed} withdrawn from ${countryName}`,
      )
      setConfirming(null)
      router.refresh()
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const turningOn = confirming === true

  return (
    <>
      <div className="admin-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="icon-badge icon-badge-primary h-10 w-10"><Globe2 className="size-4" /></div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Offer everything in {countryName}</p>
            <p className="text-xs text-muted-foreground">
              {activeTotal === 0
                ? "Nothing in the catalog to offer yet."
                : allOffered
                  ? `All ${activeTotal} active entries are offered here.`
                  : `${enabledCount} of ${activeTotal} active entries offered.`}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2">
          {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          <Switch
            checked={allOffered}
            disabled={disabled || saving || activeTotal === 0}
            onCheckedChange={(v) => setConfirming(v)}
            aria-label={`Offer every entry in ${countryName}`}
          />
        </span>
      </div>

      <AlertDialog open={confirming !== null} onOpenChange={(o) => !saving && !o && setConfirming(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {turningOn
                ? `Offer everything in ${countryName}?`
                : `Withdraw everything from ${countryName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {turningOn ? (
                  <>
                    <p>
                      Every active entry becomes selectable by vendors in {countryName} —
                      {" "}{activeTotal - enabledCount} more than today.
                    </p>
                    <p>Suspended entries stay off. You can still turn individual ones off afterwards.</p>
                  </>
                ) : (
                  <>
                    <p>
                      All {enabledCount} entries currently offered in {countryName} are withdrawn. Vendors there
                      stop seeing them when they next edit their profile.
                    </p>
                    <p>
                      Selections vendors have already saved are not removed — they stay on the profile until the
                      vendor changes them.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); apply(turningOn) }}
              disabled={saving}
              className="gap-2"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {turningOn ? "Offer everything" : "Withdraw everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
