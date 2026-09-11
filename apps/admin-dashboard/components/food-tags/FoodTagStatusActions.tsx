"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, PauseCircle, PlayCircle } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@repo/ui/components/alert-dialog"
import type { FoodTagKind, FoodTagRow } from "@/types/food-tag.types"

/*
 * Suspend / reactivate a catalog entry. AlertDialog, not Sheet — a short
 * confirmation, matching the convention CountryActions set.
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
  tag     : FoodTagRow
  singular: string
}

export function FoodTagStatusActions({ kind, tag, singular }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

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
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        {suspending ? <PauseCircle className="size-3" /> : <PlayCircle className="size-3" />}
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
              className="gap-2"
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
