"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Tag, Plus, X, Search, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination"
import { EmptyState } from "@/components/shared/EmptyState"
import type { VendorType, CountryVendorTypeLink } from "@/types/vendor-type.types"

interface Props {
  countrySlug   : string
  vendorTypes   : CountryVendorTypeLink[]
  allVendorTypes: VendorType[]
  canWrite      : boolean
}

const PAGE_SIZE = 10

/**
 * Full-page vendor-category manager for /countries/[slug]/vendor-categories —
 * the assign Sheet + remove flow extracted from the old country-hub
 * CountryVendorTypeManager (now a read-only preview, CountryVendorCategoriesPreview).
 * Each row also shows how many vendor accounts of that category operate in
 * this country — the "grouped and numbered by vendor type" requirement.
 */
export function CountryVendorCategoriesManager({ countrySlug, vendorTypes, allVendorTypes, canWrite }: Props) {
  const router = useRouter()

  const linkedIds = useMemo(() => new Set(vendorTypes.map((v) => v.vendorTypeId)), [vendorTypes])
  const available  = useMemo(() => allVendorTypes.filter((v) => !linkedIds.has(v.id)), [allVendorTypes, linkedIds])

  const [assignOpen, setAssignOpen]     = useState(false)
  const [search, setSearch]             = useState("")
  const [checked, setChecked]           = useState<Set<string>>(new Set())
  const [assigning, setAssigning]       = useState(false)
  const [removeTarget, setRemoveTarget] = useState<CountryVendorTypeLink | null>(null)
  const [removing, setRemoving]         = useState(false)
  const [page, setPage]                 = useState(1)

  const filtered = useMemo(
    () => available.filter((v) => v.name.toLowerCase().includes(search.trim().toLowerCase())),
    [available, search],
  )

  const totalPages = Math.max(1, Math.ceil(vendorTypes.length / PAGE_SIZE))
  const pageItems  = vendorTypes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function closeSheet(open: boolean) {
    setAssignOpen(open)
    if (!open) { setSearch(""); setChecked(new Set()) }
  }

  async function assign() {
    if (checked.size === 0) return
    setAssigning(true)
    const ids = Array.from(checked)
    try {
      const results = await Promise.all(
        ids.map((vendorTypeId) =>
          fetch(`/api/countries/${countrySlug}/vendor-types`, {
            method : "POST",
            headers: { "Content-Type": "application/json" },
            body   : JSON.stringify({ vendorTypeId }),
          }).then((res) => ({ res, vendorTypeId })),
        ),
      )
      const failed = results.filter((r) => !r.res.ok)
      if (failed.length === 0) {
        toast.success(`${ids.length} vendor categor${ids.length === 1 ? "y" : "ies"} assigned`)
        closeSheet(false)
        setPage(1)
        router.refresh()
      } else {
        toast.error("Some assignments failed", {
          description: `${ids.length - failed.length} succeeded, ${failed.length} failed. Try the remaining ones again.`,
        })
        router.refresh()
      }
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setAssigning(false)
    }
  }

  async function remove() {
    if (!removeTarget) return
    setRemoving(true)
    try {
      const res = await fetch(`/api/countries/${countrySlug}/vendor-types/${removeTarget.vendorTypeId}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (res.ok) {
        toast.success("Vendor category removed")
        setRemoveTarget(null)
        router.refresh()
      } else {
        toast.error("Removal failed", { description: data.message ?? "Something went wrong." })
      }
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="admin-card flex flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Vendor Categories</h2>
          <p className="text-xs text-muted-foreground">Which vendor categories are available for onboarding in this country.</p>
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

      {vendorTypes.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No vendor categories linked yet"
          description="Vendors can't select this country during onboarding until at least one category is assigned."
        />
      ) : (
        <>
          <ul className="divide-y divide-border/60">
            {pageItems.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="icon-badge icon-badge-primary h-8 w-8 shrink-0">
                    <Tag className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{link.vendorType.name}</p>
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
                    className="shrink-0 rounded-full text-muted-foreground hover:text-destructive"
                    onClick={() => setRemoveTarget(link)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <Pagination className="justify-start">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    size="sm"
                    onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1) }}
                    className={page <= 1 ? "pointer-events-none opacity-40" : ""}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <PaginationItem key={p}>
                    <PaginationLink href="#" size="icon" isActive={p === page} onClick={(e) => { e.preventDefault(); setPage(p) }}>
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    size="sm"
                    onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1) }}
                    className={page >= totalPages ? "pointer-events-none opacity-40" : ""}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}

      {/* Assign sheet — searchable, multi-select */}
      <Sheet open={assignOpen} onOpenChange={closeSheet}>
        <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Assign vendor categories</SheetTitle>
            <SheetDescription>
              Select every vendor category this country should support. Vendors will be able to choose any of these during onboarding.
            </SheetDescription>
          </SheetHeader>

          <div className="border-b border-border px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendor categories…"
                className="rounded-full pl-9"
                autoFocus
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {available.length === 0 ? "Every vendor category is already assigned." : "No vendor categories match your search."}
              </p>
            ) : (
              <ul className="space-y-1">
                {filtered.map((v) => {
                  const isChecked = checked.has(v.id)
                  return (
                    <li key={v.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-muted/50">
                        <Checkbox checked={isChecked} onCheckedChange={() => toggle(v.id)} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{v.name}</p>
                          {v.description && <p className="truncate text-xs text-muted-foreground">{v.description}</p>}
                        </div>
                        {isChecked && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            <p className="mr-auto self-center text-xs text-muted-foreground">
              {checked.size} selected
            </p>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => closeSheet(false)} disabled={assigning}>
              Cancel
            </Button>
            <Button type="button" className="rounded-full gap-1.5" disabled={assigning || checked.size === 0} onClick={assign}>
              {assigning && <Loader2 className="h-4 w-4 animate-spin" />}
              {assigning ? "Assigning…" : `Assign ${checked.size || ""}`.trim()}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Remove confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-danger h-11 w-11">
              <X className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Remove {removeTarget?.vendorType.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Vendors in this country will no longer be able to select this vendor category during onboarding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" className="rounded-full gap-1.5" disabled={removing} onClick={remove}>
              {removing && <Loader2 className="h-4 w-4 animate-spin" />}
              {removing ? "Removing…" : "Confirm Remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
