"use client"

import { useState } from "react"
import { TimezoneCombobox } from "./TimezoneCombobox"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Plus, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"

interface Props {
  countrySlug : string
  countryName : string
  /** Country.timezones — narrows the picker so a city cannot be given a zone
   *  its own country does not use. The backend refuses it either way. */
  countryTimezones?: readonly string[]
  disabled?   : boolean
  disabledHint?: string
}

/** POST /api/countries/:countrySlug/cities — name + timezone are the only required fields */
export function CreateCityDialog({ countrySlug, countryName, countryTimezones, disabled, disabledHint }: Props) {
  const router = useRouter()
  const [open, setOpen]         = useState(false)
  const [pending, setPending]   = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [name, setName]           = useState("")
  const [code, setCode]           = useState("")
  /* Pre-selected when the country uses exactly one zone, which is true for most
   * countries — an admin then never has to make this choice at all, and cannot
   * make it wrongly. */
  const [timezone, setTimezone]   = useState(countryTimezones?.length === 1 ? countryTimezones[0]! : "")
  const [latitude, setLatitude]   = useState("")
  const [longitude, setLongitude] = useState("")

  function reset() {
    setName(""); setCode("")
    setTimezone(countryTimezones?.length === 1 ? countryTimezones[0]! : "")
    setLatitude(""); setLongitude(""); setFormError(null)
  }

  async function submit() {
    setFormError(null)
    if (!name.trim())     { setFormError("Name is required."); return }
    if (!timezone.trim()) { setFormError("Timezone is required."); return }

    setPending(true)
    try {
      const res = await fetch(`/api/countries/${countrySlug}/cities`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          name     : name.trim(),
          code     : code.trim() || undefined,
          timezone : timezone.trim(),
          latitude : latitude.trim()  ? Number(latitude)  : undefined,
          longitude: longitude.trim() ? Number(longitude) : undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success("City created", { description: `${name.trim()} has been added to ${countryName}.` })
        setOpen(false)
        reset()
        router.refresh()
      } else {
        setFormError(data.message ?? "Failed to create city.")
      }
    } catch {
      setFormError("Network error. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="gap-1.5 rounded-full shadow-sm transition-all hover:-translate-y-px"
        disabled={disabled}
        title={disabled ? disabledHint : undefined}
        onClick={() => setOpen(true)}
        style={!disabled ? { backgroundImage: "linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 82%, black 12%))" } : undefined}
      >
        <Plus className="h-3.5 w-3.5" />
        Add City
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-primary h-11 w-11">
              <MapPin className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Add a city to {countryName}</AlertDialogTitle>
            <AlertDialogDescription>New cities start active and immediately available for onboarding.</AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="new-city-name">Name *</Label>
              <Input id="new-city-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kisumu" className="rounded-xl text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="new-city-timezone">Timezone *</Label>
              <TimezoneCombobox
                value={timezone}
                onChange={setTimezone}
                countryTimezones={countryTimezones}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="new-city-code">Code (optional)</Label>
              <Input id="new-city-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. KIS" className="rounded-xl text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="new-city-lat">Latitude</Label>
                <Input id="new-city-lat" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="Optional" className="rounded-xl text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="new-city-lng">Longitude</Label>
                <Input id="new-city-lng" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="Optional" className="rounded-xl text-sm" />
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" className="rounded-full gap-1.5" disabled={pending} onClick={submit}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? "Creating…" : "Create City"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
