import Link from "next/link"
import { MapPin, Check, Minus, AlertTriangle, Map as MapIcon } from "lucide-react"
import type { AdminOutletCoverage } from "@repo/types/admin-app"
import { EmptyState } from "@/components/shared/EmptyState"
import { ZONE_LEVEL_META, ZONE_STATUS_META } from "@/components/cities/geography/zone-meta"
import { OutletCoverageMapLazy } from "./OutletCoverageMapLazy"

/**
 * Where the outlet is, and what the area around it supports.
 *
 * The pin is the vendor's own claim about their premises, so a moderator needs
 * to see it on a map rather than as two decimals — that is the whole point of
 * this card. The coverage picture beside it answers the follow-up question
 * (why isn't this outlet taking orders) without a trip to the city geography
 * screen, which most vendor_ops admins can't open anyway.
 */

interface Props {
  outlet: {
    name       : string
    cityId     : string
    addressLine1: string
    latitude   : number
    longitude  : number
    adminStatus: string
    city       : { id: string; name: string } | null
  }
  coverage: AdminOutletCoverage | null
  /** Gates the link into city geography — that page needs settings:zones:read. */
  canReadZones: boolean
}

const CAPABILITY_ROWS = [
  { key: "orders"      as const, label: "Customers can order from here" },
  { key: "weDeliver"   as const, label: "Platform delivery" },
  { key: "selfDeliver" as const, label: "Vendor self-delivery" },
  { key: "mealPlans"   as const, label: "Meal plan subscriptions" },
]

export function OutletLocationCard({ outlet, coverage, canReadZones }: Props) {
  const fields: [string, string][] = [
    ["Address", outlet.addressLine1],
    ["City", outlet.city?.name ?? "—"],
    ["Coordinates", `${outlet.latitude.toFixed(5)}, ${outlet.longitude.toFixed(5)}`],
  ]

  const placement = coverage?.placement ?? null
  const zone      = coverage?.zones.find((z) => z.id === coverage.placementZoneId) ?? null
  // Only OUTSIDE_COVERAGE refuses registration, so this is the honest test for
  // "the pin is not somewhere we operate" — see vendor.placement.ts.
  const outsideCoverage = placement != null && !placement.canRegister
  const noBoundary      = coverage != null && coverage.city.boundary == null

  return (
    <div className="admin-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Location</h2>
        {canReadZones && coverage && (
          <Link
            href={`/cities/${outlet.cityId}/geography`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <MapIcon className="h-3.5 w-3.5" />
            City geography
          </Link>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-0.5 break-words text-sm text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {outsideCoverage && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive-bg px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-semibold text-destructive">Pin sits outside the city boundary</p>
            <p className="text-foreground">
              This outlet was created before the boundary reached its current shape, or the boundary has since
              been redrawn. It can&apos;t serve customers from here.
            </p>
          </div>
        </div>
      )}

      {noBoundary && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-bg px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">No operational boundary drawn for {coverage?.city.name}</p>
            <p className="text-muted-foreground">
              Outlets can still be created anywhere in the city until one is drawn, so nothing here is being
              rejected on location.
            </p>
          </div>
        </div>
      )}

      {coverage ? (
        <>
          <OutletCoverageMapLazy
            coverage={coverage}
            outletName={outlet.name}
            latitude={outlet.latitude}
            longitude={outlet.longitude}
            adminStatus={outlet.adminStatus}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Zone at this pin</p>
              {zone ? (
                <div className="mt-1.5 space-y-1.5">
                  <p className="text-sm font-medium text-foreground">{zone.name}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-0.5 text-xs font-medium text-foreground"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: ZONE_LEVEL_META[zone.level].color }} />
                      {ZONE_LEVEL_META[zone.level].label}
                    </span>
                    <span className={ZONE_STATUS_META[zone.operationalStatus].badgeCls}>
                      {ZONE_STATUS_META[zone.operationalStatus].label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{ZONE_LEVEL_META[zone.level].description}</p>
                </div>
              ) : (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {outsideCoverage
                    ? "The pin is outside the boundary, so no zone applies."
                    : "Inside the city but not in any zone yet — registration only until a zone covers this point."}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                What this area supports
              </p>
              {/* Structural capability of the area, not whether the outlet is
                  live — that is the go-live panel's job, higher up the page. */}
              <ul className="mt-2 space-y-1.5">
                {CAPABILITY_ROWS.map(({ key, label }) => {
                  const on = placement?.capabilities[key] ?? false
                  return (
                    <li key={key} className="flex items-center gap-2 text-sm">
                      {on
                        ? <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                        : <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <span className={on ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>

          {coverage.zones.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span className="font-medium">Zone levels</span>
              {/* Only levels this city actually uses — a legend listing rungs
                  nobody configured is noise. */}
              {Array.from(new Set(coverage.zones.map((z) => z.level)))
                .sort((a, b) => ZONE_LEVEL_META[a].order - ZONE_LEVEL_META[b].order)
                .map((level) => (
                  <span key={level} className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: ZONE_LEVEL_META[level].color }} />
                    {ZONE_LEVEL_META[level].label}
                  </span>
                ))}
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={MapPin}
          title="Coverage couldn't be loaded"
          description="The outlet's coordinates are above. Reload the page to try resolving its city boundary and zones again."
        />
      )}
    </div>
  )
}
