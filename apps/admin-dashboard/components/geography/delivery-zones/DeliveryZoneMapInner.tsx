
//? Loaded client-side only via dynamic(). Never import directly.
"use client"

import { useRef, useEffect, useState } from "react"
import mapboxgl from "mapbox-gl"
import MapboxDraw from "@mapbox/mapbox-gl-draw"
import "mapbox-gl/dist/mapbox-gl.css"
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"
import type {
  CityBoundary,
  ServiceArea,
  DeliveryZone,
  DeliveryZoneBoundary,
} from "@repo/types/admin-app"
import { SERVICE_AREA_MODE_CONFIG } from "@/types/geography.types"

export interface DeliveryZoneMapProps {
  cityBoundary    : CityBoundary | null
  fullServiceAreas: ServiceArea[]
  deliveryZones   : DeliveryZone[]
  editingZoneId   : string | null
  onPolygonDrawn  : (boundary: DeliveryZoneBoundary) => void
  onPolygonUpdated: (id: string, boundary: DeliveryZoneBoundary) => void
  onPolygonDeleted: (id: string) => void
}

// Delivery zone draw styles — distinct blue tone
const DRAW_STYLES = [
  {
    id    : "dz-fill-active",
    type  : "fill",
    filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
    paint : { "fill-color": "#6366f1", "fill-opacity": 0.15 },
  },
  {
    id    : "dz-stroke-active",
    type  : "line",
    filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
    paint : { "line-color": "#6366f1", "line-width": 2, "line-dasharray": [2, 2] },
  },
  {
    id    : "dz-fill-static",
    type  : "fill",
    filter: ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
    paint : { "fill-color": "#6366f1", "fill-opacity": 0.10 },
  },
  {
    id    : "dz-stroke-static",
    type  : "line",
    filter: ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
    paint : { "line-color": "#6366f1", "line-width": 2 },
  },
  {
    id    : "dz-vertex",
    type  : "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "vertex"]],
    paint : { "circle-radius": 5, "circle-color": "#6366f1" },
  },
]

export default function DeliveryZoneMapInner({
  cityBoundary,
  fullServiceAreas,
  deliveryZones,
  editingZoneId,
  onPolygonDrawn,
  onPolygonUpdated,
  onPolygonDeleted,
}: DeliveryZoneMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN!

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style    : "mapbox://styles/mapbox/light-v11",
      center   : [36.8219, -1.2921],
      zoom     : 10,
      attributionControl: false,
    })

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right")

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      styles  : DRAW_STYLES,
    })

    map.addControl(draw as unknown as mapboxgl.IControl, "top-left")

    map.on("load", () => {
      // ── City boundary (faint dashed outline) ─────────────────────────────
      if (cityBoundary) {
        map.addSource("city-boundary", {
          type: "geojson",
          data: { type: "Feature", geometry: cityBoundary, properties: {} },
        })
        map.addLayer({
          id: "city-boundary-stroke", type: "line", source: "city-boundary",
          paint: { "line-color": "#9ca3af", "line-width": 1.5, "line-dasharray": [4, 3] },
        })

        // Fly to city
        try {
          const coords: [number, number][] =
            cityBoundary.type === "Polygon"
              ? cityBoundary.coordinates.flat()
              : cityBoundary.coordinates.flat(2)
          const lngs = coords.map(([lng]) => lng)
          const lats = coords.map(([, lat]) => lat)
          map.fitBounds(
            [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
            { padding: 60, duration: 800 },
          )
        } catch { /* non-critical */ }
      }

      // ── FULL_SERVICE reference layer (faded) ──────────────────────────────
      const cfg = SERVICE_AREA_MODE_CONFIG["FULL_SERVICE"]
      fullServiceAreas.forEach((area) => {
        const id = `ref-${area.id}`
        map.addSource(id, {
          type: "geojson",
          data: { type: "Feature", geometry: area.boundaries as GeoJSON.Geometry, properties: {} },
        })
        map.addLayer({
          id: `${id}-fill`, type: "fill", source: id,
          paint: { "fill-color": cfg.color, "fill-opacity": 0.08 },
        })
        map.addLayer({
          id: `${id}-stroke`, type: "line", source: id,
          paint: { "line-color": cfg.color, "line-width": 1, "line-dasharray": [3, 2] },
        })
      })

      // ── Existing delivery zones ───────────────────────────────────────────
      deliveryZones.forEach((zone) => {
        const id = `dz-${zone.id}`
        const isEditing = zone.id === editingZoneId
        map.addSource(id, {
          type: "geojson",
          data: { type: "Feature", geometry: zone.boundaries as GeoJSON.Geometry, properties: {} },
        })
        map.addLayer({
          id: `${id}-fill`, type: "fill", source: id,
          paint: { "fill-color": "#6366f1", "fill-opacity": isEditing ? 0.25 : 0.12 },
        })
        map.addLayer({
          id: `${id}-stroke`, type: "line", source: id,
          paint: { "line-color": "#6366f1", "line-width": isEditing ? 2.5 : 1.5 },
        })
      })

      setIsReady(true)
    })

    map.on("draw.create", (e) => {
      const feature = e.features[0]
      if (feature?.geometry) {
        onPolygonDrawn(feature.geometry as DeliveryZoneBoundary)
        draw.deleteAll()
      }
    })

    map.on("draw.update", (e) => {
      const feature = e.features[0]
      if (feature?.geometry && editingZoneId) {
        onPolygonUpdated(editingZoneId, feature.geometry as DeliveryZoneBoundary)
      }
    })

    map.on("draw.delete", () => {
      if (editingZoneId) onPolygonDeleted(editingZoneId)
    })

    mapRef.current = map

    return () => { map.remove() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-render delivery zone layers when list changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReady) return

    deliveryZones.forEach((zone) => {
      const id = `dz-${zone.id}`
      if (map.getLayer(`${id}-stroke`)) map.removeLayer(`${id}-stroke`)
      if (map.getLayer(`${id}-fill`))   map.removeLayer(`${id}-fill`)
      if (map.getSource(id))            map.removeSource(id)
    })

    deliveryZones.forEach((zone) => {
      const id = `dz-${zone.id}`
      const isEditing = zone.id === editingZoneId
      map.addSource(id, {
        type: "geojson",
        data: { type: "Feature", geometry: zone.boundaries as GeoJSON.Geometry, properties: {} },
      })
      map.addLayer({
        id: `${id}-fill`, type: "fill", source: id,
        paint: { "fill-color": "#6366f1", "fill-opacity": isEditing ? 0.25 : 0.12 },
      })
      map.addLayer({
        id: `${id}-stroke`, type: "line", source: id,
        paint: { "line-color": "#6366f1", "line-width": isEditing ? 2.5 : 1.5 },
      })
    })
  }, [deliveryZones, isReady, editingZoneId])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-xl">
          <p className="text-sm text-muted-foreground animate-pulse">Initialising map…</p>
        </div>
      )}
      {isReady && (
        <div className="absolute top-3 right-3 bg-card/90 backdrop-blur-sm border border-border/60
                        rounded-xl px-3 py-2 shadow-sm pointer-events-none space-y-1">
          <p className="text-xs text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-[#22c55e] mr-1.5" />
            FULL_SERVICE reference (faded)
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-[#6366f1] mr-1.5" />
            Delivery zones — must stay inside green areas
          </p>
        </div>
      )}
    </div>
  )
}