"use client"

import { useState, useEffect } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SearchableSelect } from "@/components/shared/SearchableSelect"
import type { Country, City, ScopeEntry } from "@/types"

interface Props {
  isGlobalActor : boolean
  actorCountries: string[]
  value    : ScopeEntry[]
  onChange : (scopes: ScopeEntry[]) => void
  // Both call sites (CreateUserForm's card, UpdateScopesForm's AlertDialog)
  // already render their own "Geographic Scope" heading + explainer copy —
  // showing it a second time here just padded the component's height with
  // nothing new. Default true only for any other/future caller that embeds
  // this standalone.
  showHeader?: boolean
}

/**
 * ScopeSelector — lets the actor assign geographic scopes to an admin user.
 *
 * Rules:
 *   - Super admin (isGlobalActor): can assign GLOBAL, COUNTRY, or CITY
 *   - Identity admin (country-scoped): can only assign COUNTRY or CITY
 *     within their own countries
 *
 * Countries and cities are fetched via /api/countries and /api/countries/:id/cities.
 * Used both during creation (CreateUserForm) and editing (UpdateScopesForm).
 */
export function ScopeSelector({ isGlobalActor, actorCountries, value, onChange, showHeader = true }: Props) {
  const [countries, setCountries] = useState<Country[]>([])
  const [cities,    setCities]    = useState<Record<string, City[]>>({})

  useEffect(() => {
    // /api/countries proxies the paginated backend list ({ countries, total, ... }),
    // not a bare array — and pageSize defaults to 10 server-side, so request enough
    // to actually cover every country a scope picker needs to offer.
    fetch("/api/countries?pageSize=500&status=ACTIVE")
      .then((r) => r.json())
      .then((d) => {
        const all: Country[] = d.data?.countries ?? []
        // Country-scoped actor only sees their own countries
        setCountries(isGlobalActor ? all : all.filter((c) => actorCountries.includes(c.id)))
      })
      .catch(() => setCountries([]))
  }, [isGlobalActor, actorCountries.join(",")])

  async function fetchCities(countryId: string) {
    if (cities[countryId]) return
    // Same paginated shape as /api/countries — { cities, total, ... }.
    const res  = await fetch(`/api/countries/${countryId}/cities?pageSize=500&status=ACTIVE`)
    const data = await res.json()
    setCities((prev) => ({ ...prev, [countryId]: data.data?.cities ?? [] }))
  }

  function addScope() {
    const defaultScope: ScopeEntry = isGlobalActor
      ? { scopeType: "GLOBAL" }
      : { scopeType: "COUNTRY", countryId: actorCountries[0] ?? "" }
    onChange([...value, defaultScope])
  }

  function removeScope(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  function updateScope(index: number, updates: Partial<ScopeEntry>) {
    onChange(value.map((s, i) => i === index ? { ...s, ...updates } : s))
  }

  return (
    <div className="space-y-2">
      {showHeader && (
        <>
          <Label>Geographic Scope</Label>
          <p className="text-xs text-muted-foreground">
            Defines which countries or cities this user can manage.
            {!isGlobalActor && " You can only assign scopes within your own countries."}
          </p>
        </>
      )}

      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {value.map((scope, index) => (
        <div
          key={index}
          className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-2.5 sm:flex-row sm:items-start"
        >
          {/* Scope type */}
          <Select
            value={scope.scopeType}
            onValueChange={(v: "GLOBAL" | "COUNTRY" | "CITY") => {
              updateScope(index, { scopeType: v, countryId: undefined, cityId: undefined })
            }}
          >
            <SelectTrigger
              className="w-full sm:w-36"
              style={{ backgroundColor: "var(--input)", color: "var(--foreground)" }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)" }}>
              {isGlobalActor && <SelectItem value="GLOBAL">Global</SelectItem>}
              <SelectItem value="COUNTRY">Country</SelectItem>
              <SelectItem value="CITY">City</SelectItem>
            </SelectContent>
          </Select>

          {/* Country picker — searchable: this list is every country the actor
              can assign, up to 193 of them, which is unusable as a scroll. */}
          {(scope.scopeType === "COUNTRY" || scope.scopeType === "CITY") && (
            <div className="flex-1">
              <SearchableSelect
                options={countries.map((c) => ({ value: c.id, label: c.name }))}
                value={scope.countryId ?? ""}
                onChange={(v) => {
                  updateScope(index, { countryId: v, cityId: undefined })
                  fetchCities(v)
                }}
                placeholder="Select country…"
                searchPlaceholder="Search countries…"
                emptyLabel="No country found."
                className="rounded-md"
                aria-label="Country"
              />
            </div>
          )}

          {/* City picker — same treatment, since it sits in the same row and a
              large country's city list is just as long. */}
          {scope.scopeType === "CITY" && scope.countryId && (
            <div className="flex-1">
              <SearchableSelect
                options={(cities[scope.countryId] ?? []).map((c) => ({ value: c.id, label: c.name }))}
                value={scope.cityId ?? ""}
                onChange={(v) => updateScope(index, { cityId: v })}
                placeholder="Select city…"
                searchPlaceholder="Search cities…"
                emptyLabel="No city found."
                className="rounded-md"
                aria-label="City"
              />
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeScope(index)}
            aria-label="Remove scope"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addScope}
        className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        Add scope
      </Button>
    </div>
  )
}