import { Globe, MapPin, Building2 } from "lucide-react"
import type { SessionScopeContext }  from "@repo/types/admin-app"

interface ScopeDisplayProps {
  scope    : SessionScopeContext
  /** "badge" = compact pill, "card" = full detail block */
  variant ?: "badge" | "card"
}

/**
 * ScopeDisplay — visualises the admin's geographic scope.
 *
 * Global  → globe icon + "Global Access"
 * Country → flag initials + country count (or name if single)
 * City    → building icon + city count (or name if single)
 *
 * Uses CSS emoji flags (no external dependency, no image fetch).
 * Country codes are derived from the countryId — if you store ISO-2 codes
 * as countryId you get real flags; otherwise initials appear as fallback.
 */
export function ScopeDisplay({ scope, variant = "badge" }: ScopeDisplayProps) {
  if (scope.isGlobal) {
    return <GlobalScope variant={variant} />
  }

  if (scope.cityIds.length > 0) {
    return <CityScope scope={scope} variant={variant} />
  }

  return <CountryScope scope={scope} variant={variant} />
}

// ─── Global ───────────────────────────────────────────────────────────────────

function GlobalScope({ variant }: { variant: "badge" | "card" }) {
  if (variant === "badge") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
        <Globe className="h-3 w-3" aria-hidden="true" />
        Global
      </span>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Globe className="h-5 w-5 text-primary" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Global Access</p>
        <p className="text-xs text-muted-foreground">All countries and cities</p>
      </div>
    </div>
  )
}

// ─── Country ─────────────────────────────────────────────────────────────────

function CountryScope({
  scope,
  variant,
}: {
  scope  : SessionScopeContext
  variant: "badge" | "card"
}) {
  const count = scope.countryIds.length

  // Attempt to render emoji flag from ISO-2 country code.
  // If countryId is a UUID (not ISO-2), falls back to initials.
  const flags = scope.countryIds
    .slice(0, 3)
    .map((id) => getFlagOrInitials(id))

  if (variant === "badge") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
        <span aria-hidden="true">{flags[0]}</span>
        {count === 1 ? scope.countryIds[0] : `${count} Countries`}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-lg dark:bg-amber-950/30">
        <span aria-hidden="true">{flags[0]}</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">
          {count === 1 ? "Country Scope" : `${count} Countries`}
        </p>
        <p className="text-xs text-muted-foreground">
          {count === 1
            ? scope.countryIds[0]
            : scope.countryIds.slice(0, 3).join(", ") + (count > 3 ? ` +${count - 3}` : "")}
        </p>
      </div>
    </div>
  )
}

// ─── City ─────────────────────────────────────────────────────────────────────

function CityScope({
  scope,
  variant,
}: {
  scope  : SessionScopeContext
  variant: "badge" | "card"
}) {
  const count = scope.cityIds.length

  if (variant === "badge") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
        <Building2 className="h-3 w-3" aria-hidden="true" />
        {count === 1 ? scope.cityIds[0] : `${count} Cities`}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/30">
        <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">
          {count === 1 ? "City Scope" : `${count} Cities`}
        </p>
        <p className="text-xs text-muted-foreground">
          {scope.cityIds.slice(0, 3).join(", ") + (count > 3 ? ` +${count - 3}` : "")}
        </p>
      </div>
    </div>
  )
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Converts an ISO-2 country code to an emoji flag.
 * Falls back to 2-letter initials if the code isn't valid ISO-2.
 * No network request, no images — pure Unicode regional indicator symbols.
 */
function getFlagOrInitials(code: string): string {
  const clean = code.toUpperCase().slice(0, 2)
  // Regional indicator symbols start at U+1F1E6 (A)
  if (/^[A-Z]{2}$/.test(clean)) {
    return [...clean]
      .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
      .join("")
  }
  // Fallback: first 2 chars of the id
  return clean.slice(0, 2)
}