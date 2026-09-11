"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Globe2, Plus, X } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { Label } from "@repo/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select"
import { SearchableSelect } from "@/components/shared/SearchableSelect"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@repo/ui/components/alert-dialog"
import { EmptyState } from "@/components/shared/EmptyState"
import type { CountryLite, VendorTypeCountryLink } from "@/types/vendor-type.types"

interface Props {
  vendorTypeSlug: string
  countries?   : VendorTypeCountryLink[]
  allCountries?: CountryLite[]
  canWrite    : boolean
  subtitle?   : string
}

/**
 * "List all the countries with the number of vendors who use this
 * category" — every country this category is assigned to, plus how many
 * vendor accounts actually operate under it there (vendorAccountCount,
 * computed server-side in getVendorType). Assign/remove kept from the old
 * VendorTypeCountryManager; only the list row gained a count.
 *
 * `countries` is already scoped server-side (getVendorType filters it to
 * the caller's AdminScopeContext) — a country-scoped admin only ever
 * receives their own country's row here, never every country this global
 * catalog entry happens to be assigned to elsewhere.
 */
export function VendorCategoryCountryBreakdown({
  vendorTypeSlug, countries = [], allCountries = [], canWrite,
  subtitle = "Where this category is available, and how many vendors use it.",
}: Props) {
  const router = useRouter()

  const assignedIds = useMemo(() => new Set(countries.map((c) => c.countryId)), [countries])
  const available    = useMemo(() => allCountries.filter((c) => !assignedIds.has(c.id)), [allCountries, assignedIds])

  const [assignOpen, setAssignOpen] = useState(false)
  const [selectedId, setSelectedId] = useState("")
  const [pending, setPending]       = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<VendorTypeCountryLink | null>(null)

  async function assign() {
    if (!selectedId) return
    setPending("assign")
    try {
      const res = await fetch(`/api/vendor-types/${vendorTypeSlug}/countries`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ countryRef: selectedId }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success("Country assigned")
        setAssignOpen(false)
        setSelectedId("")
        router.refresh()
      } else {
        toast.error("Assignment failed", { description: data.message ?? "Something went wrong." })
      }
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setPending(null)
    }
  }

  async function remove() {
    if (!removeTarget) return
    setPending("remove")
    try {
      const res = await fetch(`/api/vendor-types/${vendorTypeSlug}/countries/${removeTarget.countryId}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (res.ok) {
        toast.success("Country removed")
        setRemoveTarget(null)
        router.refresh()
      } else {
        toast.error("Removal failed", { description: data.message ?? "Something went wrong." })
      }
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="admin-card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Countries</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {canWrite && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-full"
            disabled={available.length === 0}
            onClick={() => setAssignOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Assign
          </Button>
        )}
      </div>

      {countries.length === 0 ? (
        <EmptyState
          icon={Globe2}
          title="Not assigned to any country"
          description="Vendors can't select this category during onboarding until it's assigned to their country."
        />
      ) : (
        <ul className="divide-y divide-border/60">
          {countries.map((link) => (
            <li key={link.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="icon-badge icon-badge-info h-8 w-8">
                  <Globe2 className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{link.country.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(link.vendorAccountCount ?? 0).toLocaleString()} vendor{link.vendorAccountCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              {canWrite && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-muted-foreground hover:text-destructive"
                  onClick={() => setRemoveTarget(link)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Assign dialog */}
      <AlertDialog open={assignOpen} onOpenChange={(o) => { setAssignOpen(o); if (!o) setSelectedId("") }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-primary h-11 w-11">
              <Globe2 className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Assign to a country</AlertDialogTitle>
            <AlertDialogDescription>
              Vendors in the selected country will be able to choose this category during onboarding.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label className="text-xs">Country</Label>
            {/* Searchable: `available` is every country this category is not
                already assigned to, which is most of them. */}
            <SearchableSelect
              options={available.map((c) => ({ value: c.id, label: c.name }))}
              value={selectedId}
              onChange={setSelectedId}
              placeholder="Select a country…"
              searchPlaceholder="Search countries…"
              emptyLabel="No country found."
              className="rounded-xl text-sm"
              aria-label="Country"
            />
          </div>

          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setAssignOpen(false)} disabled={pending !== null}>
              Cancel
            </Button>
            <Button type="button" className="rounded-full gap-1.5" disabled={pending !== null || !selectedId} onClick={assign}>
              {pending === "assign" && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending === "assign" ? "Assigning…" : "Confirm Assign"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-danger h-11 w-11">
              <X className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Remove from {removeTarget?.country.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Vendors in this country will no longer be able to select this category during onboarding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setRemoveTarget(null)} disabled={pending !== null}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" className="rounded-full gap-1.5" disabled={pending !== null} onClick={remove}>
              {pending === "remove" && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending === "remove" ? "Removing…" : "Confirm Remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
