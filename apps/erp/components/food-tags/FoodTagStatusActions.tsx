"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, PauseCircle, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog"
import type { FoodTagKind, TaxonomyStatus } from "@/types/food-tag.types"

/*
 * Suspend / reactivate a catalog entry. AlertDialog, not Sheet — a short
 * confirmation, matching the convention CountryActions set.
 *
 * ── One component, two densities ───────────────────────────────────────────
 *
 * The table renders dozens of rows, so there it stays a compact ghost button:
 * a wall of tinted buttons is a wall of noise and none of them would read as
 * meaning anything. A details page has exactly one subject and room for a
 * real toolbar, so there it takes the tinted `warning` / `success` variant.
 * Same component, same confirmation copy, same request — only the chrome
 * differs, passed in rather than forked.
 *
 * ── The prop is the MINIMUM it needs ───────────────────────────────────────
 *
 * Not `FoodTagRow`: the details endpoint returns a different, richer shape and
 * would otherwise have to be bent into a list row's type. Four fields are what
 * this actually reads, and `FoodTagRow` satisfies them structurally, so the
 * table needed no change.
 *
 * There is deliberately no delete. Vendor profiles reference these rows
 * (onDelete: Restrict in the schema), and a customer-facing tag that vanished
 * would silently rewrite what a vendor said about themselves. Suspending stops
 * it being offered to anyone new while every existing selection stays intact —
 * which is exactly what the confirmation copy has to say, or an admin will
 * assume "suspend" means "remove".
 */

interface Props {
  kind    : FoodTagKind
  tag     : {
    id    : string
    name  : string
    status: TaxonomyStatus
    /** Vendor profiles already carrying it — what makes this a real decision. */
    vendorCount: number
  }
  singular: string
  /** "compact" for a table row, "prominent" for a details-page toolbar. */
  presentation?: "compact" | "prominent"
}

export function FoodTagStatusActions({ kind, tag, singular, presentation = "compact" }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const prominent = presentation === "prominent"
  const suspending = tag.status === "ACTIVE"
  const nextStatus = suspending ? "SUSPENDED" : "ACTIVE"

  async function apply() {
    setSaving(true)
    try {
      const res = await fetch(`/api/food-tags/${kind}/${tag.id}/status`, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ status: nextStatus }),
      })
      const body = await res.json()
      if (!res.ok) { toast.error(body.message ?? "Couldn't update"); return }

      toast.success(suspending ? `${tag.name} suspended` : `${tag.name} reactivated`)
      setOpen(false)
      router.refresh()
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button
        /* Suspending is WARNING, not destructive: it is reversible and nothing
         * is deleted. Reactivating restores, so it reads as success. Keeping
         * destructive for what cannot be undone is what lets destructive mean
         * something when it does appear. */
        variant={prominent ? (suspending ? "warning" : "success") : "ghost"}
        size={prominent ? "lg" : "sm"}
        /* Compact keeps a transparent ground but COLOURS THE LABEL, so the
         * action still reads at a glance without turning a long table into a
         * wall of tinted blocks. The tint arrives on hover, where it confirms
         * the target rather than competing for attention. */
        className={
          prominent
            ? "gap-1.5"
            : suspending
              ? "h-8 gap-1.5 px-2 text-xs text-warning hover:bg-warning/10 hover:text-warning"
              : "h-8 gap-1.5 px-2 text-xs text-success hover:bg-success/10 hover:text-success"
        }
        onClick={() => setOpen(true)}
      >
        {suspending
          ? <PauseCircle className={prominent ? "size-4" : "size-3"} />
          : <PlayCircle className={prominent ? "size-4" : "size-3"} />}
        {suspending ? "Suspend" : "Reactivate"}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspending ? `Suspend "${tag.name}"?` : `Reactivate "${tag.name}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {suspending ? (
                  <>
                    <p>
                      No country will be able to newly offer this {singular}, and vendors won&apos;t see it
                      when editing their profile.
                    </p>
                    <p>
                      {tag.vendorCount > 0
                        ? `The ${tag.vendorCount} vendor${tag.vendorCount === 1 ? "" : "s"} already using it keep it on their profile — nothing is removed.`
                        : "No vendor is using it, so nothing changes for anyone today."}
                    </p>
                  </>
                ) : (
                  <p>
                    Countries will be able to offer this {singular} again, and it reappears for vendors
                    in markets where it&apos;s switched on.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); apply() }}
              disabled={saving}
              className={
                suspending
                  ? "gap-2 bg-warning text-white hover:bg-warning/90"
                  : "gap-2 bg-success text-white hover:bg-success/90"
              }
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {suspending ? "Suspend" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
