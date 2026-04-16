"use client"

import { useState, useEffect } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { Label } from "@repo/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select"
import type { Country, City, ScopeEntry } from "@/types"

interface Props {
  isGlobalActor : boolean 
  actorCountries: string[]
  value    : ScopeEntry[]
  onChange : (scopes: ScopeEntry[]) => void
}

/**
 * ScopeSelector — lets the actor assign geographic scopes to a new admin user.
 *
 * Rules:
 *   - Super admin (isGlobalActor): can assign GLOBAL, COUNTRY, or CITY
 *   - Identity admin (country-scoped): can only assign COUNTRY or CITY
 *     within their own countries
 *
 * Countries and cities are fetched from the backend geography endpoints.
 * This component is only shown during user creation — existing scopes are
 * edited via UpdateScopesForm on the user detail page.
 */
export function ScopeSelector({ isGlobalActor, actorCountries, value, onChange }: Props) {
  const [countries, setCountries] = useState<Country[]>([])
  const [cities,    setCities]    = useState<Record<string, City[]>>({})

  useEffect(() => {
    fetch("/api/admin/geography/countries")
      .then((r) => r.json())
      .then((d) => {
        const all: Country[] = d.data ?? []
        // Country-scoped actor only sees their own countries
        setCountries(isGlobalActor ? all : all.filter((c) => actorCountries.includes(c.id)))
      })
      .catch(() => setCountries([]))
  }, [isGlobalActor, actorCountries.join(",")])

  async function fetchCities(countryId: string) {
    if (cities[countryId]) return
    const res  = await fetch(`/api/admin/geography/countries/${countryId}/cities`)
    const data = await res.json()
    setCities((prev) => ({ ...prev, [countryId]: data.data ?? [] }))
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
    <div className="space-y-3">
      <Label>Geographic Scope</Label>
      <p className="text-xs text-muted-foreground">
        Defines which countries or cities this user can manage.
        {!isGlobalActor && " You can only assign scopes within your own countries."}
      </p>

      {value.map((scope, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 rounded-lg border border-border/60 p-3 sm:flex-row sm:items-start"
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

          {/* Country picker */}
          {(scope.scopeType === "COUNTRY" || scope.scopeType === "CITY") && (
            <Select
              value={scope.countryId ?? ""}
              onValueChange={(v) => {
                updateScope(index, { countryId: v, cityId: undefined })
                fetchCities(v)
              }}
            >
              <SelectTrigger
                className="flex-1"
                style={{ backgroundColor: "var(--input)", color: "var(--foreground)" }}
              >
                <SelectValue placeholder="Select country…" />
              </SelectTrigger>
              <SelectContent style={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)" }}>
                {countries.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* City picker */}
          {scope.scopeType === "CITY" && scope.countryId && (
            <Select
              value={scope.cityId ?? ""}
              onValueChange={(v) => updateScope(index, { cityId: v })}
            >
              <SelectTrigger
                className="flex-1"
                style={{ backgroundColor: "var(--input)", color: "var(--foreground)" }}
              >
                <SelectValue placeholder="Select city…" />
              </SelectTrigger>
              <SelectContent style={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)" }}>
                {(cities[scope.countryId] ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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