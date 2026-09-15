"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Pencil, Globe2, Store, Check, Minus, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { EmptyState } from "@/components/shared/EmptyState"
import { FoodTagFormSheet } from "./FoodTagFormSheet"
import { FoodTagStatusActions } from "./FoodTagStatusActions"
import type { FoodTagKind, FoodTagRow } from "@/types/food-tag.types"

/*
 * One table for both catalogs, and for both jobs it has to do:
 *
 *   no country in view  → the global catalog. Counts, status, edit.
 *   a country in view   → the same rows plus an on/off switch for that market.
 *
 * That split is the whole information architecture. A global admin picks a
 * country to curate one; a country-scoped admin only ever has their own, so
 * the switch is simply always there for them. Nothing is hidden based on
 * permission alone — the backend decides, and a control the viewer can't use
 * is not rendered rather than rendered-then-403.
 */

interface Props {
  kind        : FoodTagKind
  singular    : string
  tags        : FoodTagRow[]
  /** The country enablement is resolved against, if any. */
  countryId   : string | null
  countryName : string | null
  /** GLOBAL scope + write permission — may create/edit/suspend catalog entries. */
  canManageCatalog: boolean
  /** Write permission and the country in scope — may flip availability. */
  canManageCountry: boolean
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ACTIVE    : { label: "Active",     cls: "badge-success" },
  SUSPENDED : { label: "Suspended",  cls: "badge-warning" },
  DEPRECATED: { label: "Retired",    cls: "badge-danger"  },
}

export function FoodTagsTable({
  kind, singular, tags, countryId, countryName, canManageCatalog, canManageCountry,
}: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<FoodTagRow | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const showCountryColumn = countryId !== null

  async function toggleCountry(tag: FoodTagRow, enabled: boolean) {
    setPendingId(tag.id)
    try {
      const res = await fetch(`/api/food-tags/${kind}/${tag.id}/countries/${countryId}`, {
        method : "PUT",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ enabled }),
      })
      const body = await res.json()
      if (!res.ok) { toast.error(body.message ?? "Couldn't update availability"); return }

      toast.success(
        enabled
          ? `${tag.name} is now offered in ${countryName ?? "this country"}`
          : `${tag.name} is no longer offered in ${countryName ?? "this country"}`,
      )
      startTransition(() => router.refresh())
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setPendingId(null)
    }
  }

  if (tags.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title={`No ${singular}s yet`}
        description={
          canManageCatalog
            ? `Create the first ${singular} to make it available to vendors.`
            : `A global admin hasn't added any ${singular}s yet.`
        }
      />
    )
  }

  return (
    <>
      {/* overflow-x-auto so the counts columns can scroll on a phone rather
          than squeezing the name into two characters. */}
      <div className="admin-card overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Countries</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Vendors</th>
              {showCountryColumn && (
                <th className="px-4 py-3 font-medium whitespace-nowrap">
                  Offered in {countryName ?? "country"}
                </th>
              )}
              {canManageCatalog && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => {
              const badge = STATUS_BADGE[tag.status] ?? STATUS_BADGE.ACTIVE!
              return (
                <tr key={tag.id} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{tag.name}</p>
                    {tag.description && (
                      <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{tag.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={badge.cls}>{badge.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Globe2 className="size-3.5" />{tag.countryCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Store className="size-3.5" />{tag.vendorCount}
                    </span>
                  </td>

                  {showCountryColumn && (
                    <td className="px-4 py-3">
                      {canManageCountry ? (
                        <span className="inline-flex items-center gap-2">
                          <Switch
                            checked={!!tag.enabledInCountry}
                            disabled={pendingId === tag.id || tag.status !== "ACTIVE"}
                            onCheckedChange={(v) => toggleCountry(tag, v)}
                            aria-label={`Offer ${tag.name} in ${countryName ?? "this country"}`}
                          />
                          {pendingId === tag.id && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                        </span>
                      ) : tag.enabledInCountry ? (
                        <Check className="size-4 text-success" aria-label="Offered" />
                      ) : (
                        <Minus className="size-4 text-muted-foreground" aria-label="Not offered" />
                      )}
                      {/* A globally suspended entry can be switched off but never
                          on — say so rather than leaving a dead control. */}
                      {tag.status !== "ACTIVE" && canManageCountry && !tag.enabledInCountry && (
                        <p className="mt-1 text-[11px] text-muted-foreground">Suspended globally</p>
                      )}
                    </td>
                  )}

                  {canManageCatalog && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => setEditing(tag)}>
                          <Pencil className="size-3" />Edit
                        </Button>
                        <FoodTagStatusActions kind={kind} tag={tag} singular={singular} />
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <FoodTagFormSheet
        kind={kind}
        singular={singular}
        tag={editing}
        open={editing !== null}
        onOpenChange={(open) => { if (!open) setEditing(null) }}
      />
    </>
  )
}
