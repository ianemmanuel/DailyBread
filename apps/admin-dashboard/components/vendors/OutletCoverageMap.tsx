"use client"

import { useEffect, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import type { AdminOutletCoverage, ZoneBoundary } from "@repo/types/admin-app"
import { ZONE_LEVEL_META, ZONE_STATUS_META, zoneLevelColorExpression } from "@/components/cities/geography/zone-meta"

/**
 * Read-only map of one outlet inside its city's operational geography — the
 * ERP counterpart to what the vendor sees while placing the pin.
 *
 * Deliberately not a picker: an admin never moves a vendor's outlet. It answers
 * the two questions a moderator actually has — is this pin where the vendor says
 * it is, and does the area around it support what the outlet is trying to do.
 *
 * Zones are shaded by ZoneLevel, not by the vendor-facing placement status: this
 * is the internal audience, and `zone-meta.ts` is already the one place level
 * presentation lives (the city geography workspace uses the same colours, so the
 * two screens read identically).
 */

const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

/** Marker colour tracks the outlet's operational health, so a suspended outlet
 *  is obvious on the map without reading the badges above it. */
const MARKER_COLOR: Record<string, string> = {
  ACTIVE               : "#10b981",
  SUSPENDED            : "#f59e0b",
  SUSPENDED_COMPLIANCE : "#f59e0b",
  BANNED               : "#ef4444",
}

interface Props {
  coverage   : AdminOutletCoverage
  outletName : string
  latitude   : number
  longitude  : number
  adminStatus: string
}

// ─── geometry helpers ─────────────────────────────────────────────────────────

function outerRings(geom: ZoneBoundary): [number, number][][] {
  return geom.type === "Polygon"
    ? [geom.coordinates[0] ?? []]
    : geom.coordinates.map((poly) => poly[0] ?? [])
}

/* A world-sized polygon with the city boundary punched out of it — everything
 * we do not cover is dimmed, which reads instantly next to an outline a viewer
 * would otherwise have to trace. Same treatment as the vendor's own picker. */
function maskFeature(boundary: ZoneBoundary): GeoJSON.Feature {
  const world: [number, number][] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]
  return {
    type      : "Feature",
    properties: {},
    geometry  : { type: "Polygon", coordinates: [world, ...outerRings(boundary)] },
  }
}

function zonesToFC(coverage: AdminOutletCoverage): GeoJSON.FeatureCollection {
  return {
    type    : "FeatureCollection",
    features: coverage.zones.map((z) => ({
      type      : "Feature",
      id        : z.id,
      properties: {
        name  : z.name,
        level : z.level,
        status: z.operationalStatus,
        // The zone the pin actually landed in gets a heavier outline.
        here  : z.id === coverage.placementZoneId,
      },
      geometry: z.boundaries as unknown as GeoJSON.Geometry,
    })),
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

export function OutletCoverageMap({ coverage, outletName, latitude, longitude, adminStatus }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return

    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container         : containerRef.current,
      style             : "mapbox://styles/mapbox/light-v11",
      center            : [longitude, latitude],
      zoom              : 13,
      attributionControl: false,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
    map.addControl(new mapboxgl.AttributionControl({ compact: true }))

    map.on("load", () => {
      setReady(true)

      if (coverage.city.boundary) {
        map.addSource("city-mask", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [maskFeature(coverage.city.boundary)] },
        })
        map.addLayer({
          id: "city-mask-fill", type: "fill", source: "city-mask",
          paint: { "fill-color": "#0f172a", "fill-opacity": 0.3 },
        })
      }

      if (coverage.zones.length > 0) {
        map.addSource("zones", { type: "geojson", data: zonesToFC(coverage) })
        map.addLayer({
          id: "zones-fill", type: "fill", source: "zones",
          paint: { "fill-color": zoneLevelColorExpression(), "fill-opacity": 0.22 },
        })
        map.addLayer({
          id: "zones-line", type: "line", source: "zones",
          paint: {
            "line-color": zoneLevelColorExpression(),
            "line-width": ["case", ["get", "here"], 3, 1.5],
            "line-opacity": 0.9,
          },
        })

        map.on("click", "zones-fill", (e) => {
          const f = e.features?.[0]
          if (!f) return
          const level  = String(f.properties?.level ?? "")
          const status = String(f.properties?.status ?? "")
          const levelLabel  = ZONE_LEVEL_META[level as keyof typeof ZONE_LEVEL_META]?.label ?? level
          const statusLabel = ZONE_STATUS_META[status as keyof typeof ZONE_STATUS_META]?.label ?? status
          new mapboxgl.Popup({ offset: 8, closeButton: false })
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font: 500 12.5px system-ui; padding: 2px 1px;">
                 <div style="font-weight:600;">${escapeHtml(String(f.properties?.name ?? "Zone"))}</div>
                 <div style="color:#6b7280; margin-top:2px;">${escapeHtml(levelLabel)} · ${escapeHtml(statusLabel)}</div>
               </div>`,
            )
            .addTo(map)
        })
        map.on("mouseenter", "zones-fill", () => { map.getCanvas().style.cursor = "pointer" })
        map.on("mouseleave", "zones-fill", () => { map.getCanvas().style.cursor = "" })
      }

      new mapboxgl.Marker({ color: MARKER_COLOR[adminStatus] ?? "#3b82f6" })
        .setLngLat([longitude, latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
            `<div style="font: 500 12.5px system-ui; padding: 2px 1px;">
               <div style="font-weight:600;">${escapeHtml(outletName)}</div>
               <div style="color:#6b7280; margin-top:2px;">${latitude.toFixed(5)}, ${longitude.toFixed(5)}</div>
             </div>`,
          ),
        )
        .addTo(map)

      /*
       * Frame the city, but never at the cost of losing the pin. An outlet
       * sitting outside the boundary is exactly the case a moderator opened this
       * page for, so the pin is always inside the view.
       */
      if (coverage.city.boundary) {
        const bounds = new mapboxgl.LngLatBounds()
        for (const ring of outerRings(coverage.city.boundary)) {
          for (const [lng, lat] of ring) bounds.extend([lng, lat])
        }
        bounds.extend([longitude, latitude])
        map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 0 })
      }
    })

    const resizeObserver = new ResizeObserver(() => mapRef.current?.resize())
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read-only view, built once; nothing on this page mutates the outlet's location live.
  }, [])

  if (!token) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 text-center sm:h-96">
        <p className="max-w-xs text-sm text-muted-foreground">
          Map unavailable — NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN isn&apos;t configured.
        </p>
      </div>
    )
  }

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-xs)] sm:h-96">
      <div ref={containerRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  )
}
