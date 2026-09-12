"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Pencil, PauseCircle, PlayCircle, Loader2 } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog"
import { TaxCategoryFormSheet } from "./TaxCategoryFormSheet"
import type { TaxCategory } from "@/types/tax.types"

/*
 * Per-row controls: rename, and suspend or reactivate.
 *
 * No delete, deliberately. A category a country has rated, or a dish has
 * named, must not vanish and silently reprice somebody's menu — the same
 * Restrict-and-suspend rule the cuisine and dietary-tag catalogs follow. The
 * confirmation says exactly what suspending does and does not do, because
 * "suspend" reads like "remove" unless you spell it out.
 */

export function TaxCategoryActions({ category }: { category: TaxCategory }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const suspending = category.status === "ACTIVE"

  async function setStatus() {
    setPending(true)
    try {
      const res = await fetch(`/api/tax/categories/${category.id}/status`, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ status: suspending ? "SUSPENDED" : "ACTIVE" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? "Something went wrong")

      toast.success(suspending ? `${category.name} suspended` : `${category.name} reactivated`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <TaxCategoryFormSheet
        category={category}
        trigger={
          <Button variant="ghost" size="sm">
            <Pencil className="size-4" />
            <span className="sr-only">Rename {category.name}</span>
          </Button>
        }
      />

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : suspending ? (
              <PauseCircle className="size-4" />
            ) : (
              <PlayCircle className="size-4" />
            )}
            <span className="sr-only">
              {suspending ? "Suspend" : "Reactivate"} {category.name}
            </span>
          </Button>
        </AlertDialogTrigger>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspending ? `Suspend ${category.name}?` : `Reactivate ${category.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {suspending ? (
                  <>
                    <p>
                      No market will be able to newly adopt it. Nothing is removed and no price changes.
                    </p>
                    {(category._count.countryRates > 0 || category._count.menuItems > 0) && (
                      <p>
                        {category._count.countryRates} country rate
                        {category._count.countryRates === 1 ? "" : "s"} and {category._count.menuItems} meal
                        {category._count.menuItems === 1 ? "" : "s"} keep using it exactly as they do now.
                        A country that already has a rate on it can still switch that rate off.
                      </p>
                    )}
                  </>
                ) : (
                  <p>Markets will be able to set a rate against it again.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={setStatus}>
              {suspending ? "Suspend" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
