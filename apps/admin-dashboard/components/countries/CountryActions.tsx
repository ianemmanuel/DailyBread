"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Power, PowerOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"

interface Props {
  countrySlug: string
  countryName: string
  status     : string
  /** SETTINGS_GEOGRAPHY_WRITE, and the backend hard-requires global scope too */
  canWrite   : boolean
  isGlobal   : boolean
  size?      : "sm" | "default"
  /** Gates activation (not deactivation) — see CountryLaunchChecklist. Omit to leave ungated. */
  canActivate?: boolean
}

/**
 * Activate/deactivate is the only mutation countries support from the admin
 * dashboard — there's no create endpoint (countries are seed-managed).
 * Backend requires global scope for this regardless of permission, so a
 * country-scoped WRITE holder still can't flip it — hidden here rather than
 * shown-then-403'd.
 */
export function CountryActions({ countrySlug, countryName, status, canWrite, isGlobal, size = "sm", canActivate = true }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  if (!canWrite || !isGlobal) return null

  const isActive = status === "ACTIVE"
  const action   = isActive ? "deactivate" : "activate"
  const blocked  = !isActive && !canActivate

  async function confirm() {
    setPending(true)
    try {
      const res = await fetch(`/api/countries/${countrySlug}/${action}`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        toast.success(isActive ? "Country deactivated" : "Country activated", {
          description: isActive
            ? `${countryName} is no longer an operating market.`
            : `${countryName} is now active. Mark it ready for vendor onboarding and customer operations when you are.`,
        })
        setOpen(false)
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

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled={blocked}
        title={blocked ? "Add at least one vendor type and one document type first" : undefined}
        className={[
          "gap-1.5 rounded-full transition-all hover:-translate-y-px",
          isActive
            ? "border-destructive/30 text-destructive hover:bg-destructive-bg"
            : "border-success/30 text-success hover:bg-success-bg",
        ].join(" ")}
        onClick={(e) => { e.preventDefault(); setOpen(true) }}
      >
        {isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
        {isActive ? "Deactivate" : "Activate"}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className={`icon-badge h-11 w-11 ${isActive ? "icon-badge-danger" : "icon-badge-success"}`}>
              {isActive ? <PowerOff className="h-5 w-5" /> : <Power className="h-5 w-5" />}
            </div>
            <AlertDialogTitle>{isActive ? "Deactivate" : "Activate"} {countryName}?</AlertDialogTitle>
            <AlertDialogDescription>
              {isActive
                ? "This country will no longer be a live market — cities, vendor types, and document types stay in place, but nothing new happens here until it's reactivated."
                : "This country becomes an operating market. Vendor onboarding and customer operations stay paused until you separately mark each one ready."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={isActive ? "destructive" : "default"}
              className="rounded-full gap-1.5"
              disabled={pending}
              onClick={confirm}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? "Saving…" : isActive ? "Deactivate" : "Activate"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
