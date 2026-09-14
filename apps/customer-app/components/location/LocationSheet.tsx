"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { LocateFixed, Loader2, MapPin, Check, AlertCircle } from "lucide-react"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@repo/ui/components/sheet"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { setDeliveryLocation } from "@/lib/location/actions"
import { clientFetch } from "@/lib/api/client"
import type { StoredLocation } from "@/lib/location/cookie"
import type { Serviceability } from "@repo/types/customer-app"
import { SERVICEABILITY_COPY } from "./serviceability-copy"

/*
 * Choosing where the food goes.
 *
 * ─── Why this is the first thing the app asks ────────────────────────────────
 *
 * Every restaurant, price and delivery estimate is a function of one point, so
 * there is nothing honest to show before it is known. Uber Eats and DoorDash
 * both open on exactly this question for the same reason.
 *
 * ─── Coverage is checked here, not after ─────────────────────────────────────
 *
 * The point is put to the backend BEFORE it is saved, so someone outside the
 * service area is told in place rather than saving an address and meeting an
 * empty feed with no explanation. The verdict is only ever displayed — it is
 * never stored, because coverage changes when an admin edits a zone and a
 * cached answer would go quietly stale.
 */

interface Props {
  open        : boolean
  onOpenChange: (open: boolean) => void
  current     : StoredLocation | null
  signedIn    : boolean
}

type Phase =
  | { step: "idle" }
  | { step: "locating" }
  | { step: "checking"; latitude: number; longitude: number; label: string }
  | { step: "answered"; latitude: number; longitude: number; label: string; serviceability: Serviceability }

export function LocationSheet({ open, onOpenChange, current, signedIn }: Props) {
  const router = useRouter()
  const [phase, setPhase] = React.useState<Phase>({ step: "idle" })
  const [manual, setManual] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  /*
   * Latest-wins. Someone can press "use my location" and then paste
   * coordinates before the first answer returns; without this the earlier,
   * slower response would overwrite the later one and show a verdict for a
   * place they are no longer asking about.
   */
  const sequence = React.useRef(0)

  async function check(latitude: number, longitude: number, label: string) {
    const ticket = ++sequence.current
    setPhase({ step: "checking", latitude, longitude, label })

    try {
      const serviceability = await clientFetch<Serviceability>(
        `/api/serviceability?latitude=${latitude}&longitude=${longitude}`,
      )
      if (ticket !== sequence.current) return
      setPhase({ step: "answered", latitude, longitude, label, serviceability })
    } catch {
      if (ticket !== sequence.current) return
      /*
       * A failed check must not block someone. Saving still works, and the feed
       * asks the same question again on render — so the answer arrives one
       * screen later rather than the app becoming unusable.
       */
      setPhase({
        step: "answered", latitude, longitude, label,
        serviceability: {
          status: "AREA_NOT_CONFIGURED", isServiceable: false,
          zoneId: null, zoneName: null, cityId: null, cityName: null,
          platformDelivers: false, vendorMaySelfDeliver: false,
        },
      })
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("This browser can't share your location. Enter coordinates instead.")
      return
    }

    setPhase({ step: "locating" })
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        void check(latitude, longitude, "Your current location")
      },
      (error) => {
        setPhase({ step: "idle" })
        toast.error(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Enter your coordinates instead."
            : "We couldn't get your location. Enter your coordinates instead.",
        )
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  function submitManual(event: React.FormEvent) {
    event.preventDefault()
    const [rawLat, rawLng] = manual.split(",").map((part) => Number(part.trim()))

    if (
      rawLat === undefined || rawLng === undefined ||
      !Number.isFinite(rawLat) || !Number.isFinite(rawLng) ||
      Math.abs(rawLat) > 90 || Math.abs(rawLng) > 180
    ) {
      toast.error("Enter coordinates as latitude, longitude — for example -1.2864, 36.8172")
      return
    }

    void check(rawLat, rawLng, `${rawLat.toFixed(4)}, ${rawLng.toFixed(4)}`)
  }

  async function save() {
    if (phase.step !== "answered") return
    setSaving(true)
    try {
      const result = await setDeliveryLocation({
        latitude : phase.latitude,
        longitude: phase.longitude,
        label    : phase.label,
      })
      if (!result.ok) {
        toast.error(result.message ?? "We couldn't save that location.")
        return
      }
      onOpenChange(false)
      // The feed is rendered from this location, so it has to re-render.
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const answered = phase.step === "answered" ? phase.serviceability : null
  const copy = answered ? SERVICEABILITY_COPY[answered.status] : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="space-y-1.5 text-left">
          <SheetTitle className="heading-md">Where are we delivering?</SheetTitle>
          <SheetDescription>
            Restaurants, prices and delivery times all depend on this.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 overflow-y-auto px-4 pb-6">
          {current && (
            <p className="rounded-xl bg-[var(--muted)] px-3 py-2 text-sm text-[var(--muted-foreground)]">
              Currently delivering to{" "}
              <span className="font-medium text-[var(--foreground)]">{current.label}</span>
            </p>
          )}

          <Button
            type="button"
            onClick={useMyLocation}
            disabled={phase.step === "locating"}
            className="w-full cursor-pointer gap-2"
            size="lg"
          >
            {phase.step === "locating"
              ? <Loader2 className="size-4 animate-spin" />
              : <LocateFixed className="size-4" />}
            Use my current location
          </Button>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-xs text-[var(--muted-foreground)]">or</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          {/*
            * Coordinates, not an address search — deliberately.
            *
            * Turning text into a point needs a geocoding provider, and this app
            * has no key for one yet. A search box that silently did nothing
            * would be worse than an honest input: this one works today, and the
            * map picker replaces it the moment Mapbox is wired up (the vendor
            * dashboard already has that component and its token).
            */}
          <form onSubmit={submitManual} className="space-y-2">
            <label htmlFor="coords" className="text-sm font-medium text-[var(--foreground)]">
              Enter coordinates
            </label>
            <div className="flex gap-2">
              <Input
                id="coords"
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                placeholder="-1.2864, 36.8172"
                inputMode="decimal"
                className="flex-1"
              />
              <Button type="submit" variant="outline" className="cursor-pointer">
                Check
              </Button>
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              Address search arrives with the map picker.
            </p>
          </form>

          {phase.step === "checking" && (
            <div className="flex items-center gap-2 rounded-xl bg-[var(--muted)] px-3 py-3 text-sm text-[var(--muted-foreground)]">
              <Loader2 className="size-4 animate-spin" />
              Checking whether we deliver there…
            </div>
          )}

          {answered && copy && (
            <div
              className={`space-y-2 rounded-xl border p-4 ${
                answered.isServiceable
                  ? "border-[var(--success)]/30 bg-[var(--success-bg)]"
                  : "border-[var(--warning)]/30 bg-[var(--warning-bg)]"
              }`}
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                {answered.isServiceable
                  ? <Check className="size-4 text-[var(--success)]" />
                  : <AlertCircle className="size-4 text-[var(--warning)]" />}
                {copy.title}
              </p>
              <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
                {copy.body}
              </p>
              {answered.zoneName && (
                <p className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                  <MapPin className="size-3" />
                  {answered.zoneName}
                  {answered.cityName ? `, ${answered.cityName}` : ""}
                </p>
              )}
            </div>
          )}

          {phase.step === "answered" && (
            /* Saving is allowed even outside the service area. Someone
             * planning a delivery to an address they are moving to should be
             * able to keep it; the feed says plainly that we are not there yet. */
            <Button
              type="button"
              onClick={save}
              disabled={saving}
              size="lg"
              className="w-full cursor-pointer gap-2"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {answered?.isServiceable ? "Deliver here" : "Save this location anyway"}
            </Button>
          )}

          {!signedIn && (
            <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
              Sign in to save addresses to your account and reuse them next time.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
