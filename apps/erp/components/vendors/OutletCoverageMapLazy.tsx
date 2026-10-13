"use client"

import dynamic from "next/dynamic"
import type { AdminOutletCoverage } from "@repo/types/admin-app"

/*
 * mapbox-gl is ~1.8 MB parsed. This page is opened to moderate an outlet far
 * more often than to look at where it sits, so the map is loaded on demand
 * instead of shipped in the route's initial bundle — the same fix the vendor
 * dashboard's outlet forms needed.
 */
const OutletCoverageMap = dynamic(
  () => import("./OutletCoverageMap").then((m) => m.OutletCoverageMap),
  {
    ssr    : false,
    loading: () => (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-border bg-muted/20 sm:h-96">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    ),
  },
)

interface Props {
  coverage   : AdminOutletCoverage
  outletName : string
  latitude   : number
  longitude  : number
  adminStatus: string
}

export function OutletCoverageMapLazy(props: Props) {
  return <OutletCoverageMap {...props} />
}
