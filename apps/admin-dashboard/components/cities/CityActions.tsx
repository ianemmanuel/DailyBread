"use client"

import { useState } from "react"
import { TimezoneCombobox } from "./TimezoneCombobox"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Power, PowerOff, Pencil } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@repo/ui/components/alert-dialog"
import type { City } from "@repo/types/admin-app"

interface Props {
  city      : Pick<City, "id" | "slug" | "name" | "timezone" | "latitude" | "longitude" | "status">
  /** Optional: narrows the timezone picker where the caller knows the country.
   *  Absent simply means the full IANA list, still validated server-side. */
  countryTimezones?: readonly string[]
  canWrite  : boolean
  /** When set, also busts the country-scoped cities tags (see /countries/[slug]/cities). */
  countryRef?: string
}

/**
 * Edit + activate/deactivate for one city. `code` is intentionally not
 * editable here — the backend's PATCH /cities/:ref silently ignores `code`
 * updates (see admin.city.service.ts), so exposing it would just lie to
 * the admin about what changed.
 */
export function CityActions({ city, canWrite, countryRef, countryTimezones}: Props) {
  const router = useRouter()
  const [editOpen, setEditOpen]     = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [pending, setPending]       = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)

  const [name, setName]         = useState(city.name)
  const [timezone, setTimezone] = useState(city.timezone)
  const [latitude, setLatitude] = useState(city.latitude?.toString() ?? "")
  const [longitude, setLongitude] = useState(city.longitude?.toString() ?? "")
  const [deactivateReason, setDeactivateReason] = useState("")

  if (!canWrite) return null

  const isActive = city.status === "ACTIVE"
  const action   = isActive ? "deactivate" : "activate"

  async function toggleStatus() {
    if (isActive && !deactivateReason.trim()) {
      toast.error("A reason is required to deactivate a city")
      return
    }
    setPending(true)
    try {
      const url = countryRef
        ? `/api/cities/${city.slug}/${action}?countryRef=${countryRef}`
        : `/api/cities/${city.slug}/${action}`
      const res = await fetch(url, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : isActive ? JSON.stringify({ reason: deactivateReason }) : undefined,
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(isActive ? "City deactivated" : "City activated")
        setStatusOpen(false)
        setDeactivateReason("")
        router.refresh()
      } else {
        toast.error("Action failed", { description: data.message ?? "Please try again." })
      }
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setPending(false)
    }
  }

  async function saveEdit() {
    setFormError(null)
    if (!name.trim()) { setFormError("Name is required."); return }
    if (!timezone.trim()) { setFormError("Timezone is required."); return }

    setPending(true)
    try {
      const res = await fetch(`/api/cities/${city.slug}`, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          name     : name.trim(),
          timezone : timezone.trim(),
          latitude : latitude.trim()  ? Number(latitude)  : undefined,
          longitude: longitude.trim() ? Number(longitude) : undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success("City updated")
        setEditOpen(false)
        router.refresh()
      } else {
        setFormError(data.message ?? "Failed to update city.")
      }
    } catch {
      setFormError("Network error. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
        onClick={() => setEditOpen(true)}
        aria-label={`Edit ${city.name}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={[
          "h-8 w-8 rounded-full",
          isActive ? "text-muted-foreground hover:bg-destructive-bg hover:text-destructive" : "text-muted-foreground hover:bg-success-bg hover:text-success",
        ].join(" ")}
        onClick={() => setStatusOpen(true)}
        aria-label={isActive ? `Deactivate ${city.name}` : `Activate ${city.name}`}
      >
        {isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
      </Button>

      {/* Activate/deactivate confirm */}
      <AlertDialog open={statusOpen} onOpenChange={(o) => { setStatusOpen(o); if (!o) setDeactivateReason("") }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className={`icon-badge h-11 w-11 ${isActive ? "icon-badge-danger" : "icon-badge-success"}`}>
              {isActive ? <PowerOff className="h-5 w-5" /> : <Power className="h-5 w-5" />}
            </div>
            <AlertDialogTitle>{isActive ? "Deactivate" : "Activate"} {city.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {isActive
                ? "Outlets in this city become unreachable for new orders until it's reactivated."
                : "This city becomes available for vendor onboarding and delivery."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {isActive && (
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="city-deactivate-reason">Reason *</Label>
              <Textarea
                id="city-deactivate-reason"
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
                placeholder="e.g. Suspending operations in this city temporarily"
                className="min-h-16 text-sm"
              />
            </div>
          )}
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setStatusOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={isActive ? "destructive" : "default"}
              className="rounded-full gap-1.5"
              disabled={pending || (isActive && !deactivateReason.trim())}
              onClick={toggleStatus}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? "Saving…" : isActive ? "Deactivate" : "Activate"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit */}
      <AlertDialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setFormError(null) }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-primary h-11 w-11">
              <Pencil className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Edit {city.name}</AlertDialogTitle>
            <AlertDialogDescription>Update this city&apos;s name, timezone, or coordinates.</AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="city-name">Name *</Label>
              <Input id="city-name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="city-timezone">Timezone *</Label>
              {/* Was a free-text box, which is how a city ended up in another
                  country's timezone. The backend now refuses one the country
                  does not use; this stops it being typed. */}
              <TimezoneCombobox
                value={timezone}
                onChange={setTimezone}
                countryTimezones={countryTimezones}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="city-lat">Latitude</Label>
                <Input id="city-lat" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="Optional" className="rounded-xl text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="city-lng">Longitude</Label>
                <Input id="city-lng" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="Optional" className="rounded-xl text-sm" />
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setEditOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" className="rounded-full gap-1.5" disabled={pending} onClick={saveEdit}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
