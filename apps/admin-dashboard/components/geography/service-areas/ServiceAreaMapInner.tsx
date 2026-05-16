
//* Loaded client-side only via dynamic(). Never import directly.
"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import mapboxgl from "mapbox-gl"
import MapboxDraw from "@mapbox/mapbox-gl-draw"
import "mapbox-gl/dist/mapbox-gl.css"
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"
import type {
    CityBoundary, 
    ServiceArea,
    ServiceAreaBoundary,
    ServiceAreaMode,
} from "@repo/types/admin-app"
import { SERVICE_AREA_MODE_CONFIG } from "@/types/geography.types"

export interface ServiceAreaMapProps {
  cityBoundary    : CityBoundary | null
  serviceAreas    : ServiceArea[]
  /** Called when user finishes drawing a new polygon */
  onPolygonDrawn  : (boundary: ServiceAreaBoundary) => void
  /** Called when user finishes editing an existing polygon */
  onPolygonUpdated: (id: string, boundary: ServiceAreaBoundary) => void
  /** Called when user deletes a polygon from the map */
  onPolygonDeleted: (id: string) => void
  /** The active draw mode color hint from the sidebar */
  activeMode      : ServiceAreaMode
  /** Service area being edited (highlights it) */
  editingId       : string | null
}

export default function ServiceAreaMapInner({
  cityBoundary,
  serviceAreas,
  onPolygonDrawn,
  onPolygonUpdated,
  onPolygonDeleted,
  activeMode,
  editingId,
}: ServiceAreaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const drawRef      = useRef<MapboxDraw | null>(null)
  const [isReady, setIsReady] = useState(false)

  const getDrawStyles = useCallback((mode: ServiceAreaMode) => {
    const cfg = SERVICE_AREA_MODE_CONFIG[mode]
    return [
      {
        id    : "gl-draw-polygon-fill-active",
        type  : "fill",
        filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
        paint : { "fill-color": cfg.color, "fill-opacity": 0.15 },
      },
      {
        id    : "gl-draw-polygon-stroke-active",
        type  : "line",
        filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
        paint : { "line-color": cfg.color, "line-width": 2, "line-dasharray": [2, 2] },
      },
      {
        id    : "gl-draw-polygon-fill-static",
        type  : "fill",
        filter: ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
        paint : { "fill-color": cfg.color, "fill-opacity": 0.10 },
      },
      {
        id    : "gl-draw-polygon-stroke-static",
        type  : "line",
        filter: ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
        paint : { "line-color": cfg.color, "line-width": 2 },
      },
      {
        id    : "gl-draw-point-vertex",
        type  : "circle",
        filter: ["all", ["==", "$type", "Point"], ["==", "meta", "vertex"]],
        paint : { "circle-radius": 5, "circle-color": cfg.color },
      },
    ]
  }, [])

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
      styles  : getDrawStyles(activeMode),
    })

    map.addControl(draw as unknown as mapboxgl.IControl, "top-left")

    map.on("load", () => {
      // ── City boundary reference layer (read-only, not in Draw) ───────────
      if (cityBoundary) {
        map.addSource("city-boundary", {
          type: "geojson",
          data: { type: "Feature", geometry: cityBoundary, properties: {} },
        })
        map.addLayer({
          id    : "city-boundary-fill",
          type  : "fill",
          source: "city-boundary",
          paint : { "fill-color": "#6b7280", "fill-opacity": 0.04 },
        })
        map.addLayer({
          id    : "city-boundary-stroke",
          type  : "line",
          source: "city-boundary",
          paint : { "line-color": "#6b7280", "line-width": 2, "line-dasharray": [4, 3] },
        })

        // Fly to city boundary
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

      //* Existing service area polygons
      serviceAreas.forEach((area) => {
        const cfg = SERVICE_AREA_MODE_CONFIG[area.mode]
        const sourceId = `sa-${area.id}`

        map.addSource(sourceId, {
          type: "geojson",
          data: { type: "Feature", geometry: area.boundaries as GeoJSON.Geometry, properties: {} },
        })
        map.addLayer({
          id    : `${sourceId}-fill`,
          type  : "fill",
          source: sourceId,
          paint : { "fill-color": cfg.color, "fill-opacity": 0.15 },
        })
        map.addLayer({
          id    : `${sourceId}-stroke`,
          type  : "line",
          source: sourceId,
          paint : { "line-color": cfg.color, "line-width": 1.5 },
        })
      })

      setIsReady(true)
    })

    // Draw event handlers
    map.on("draw.create", (e) => {
      const feature = e.features[0]
      if (feature?.geometry) {
        onPolygonDrawn(feature.geometry as ServiceAreaBoundary)
        draw.deleteAll() // remove from draw — will be re-added as a static layer
      }
    })

    map.on("draw.update", (e) => {
      const feature = e.features[0]
      if (feature?.geometry && feature.id && editingId) {
        onPolygonUpdated(editingId, feature.geometry as ServiceAreaBoundary)
      }
    })

    map.on("draw.delete", () => {
      if (editingId) onPolygonDeleted(editingId)
    })

    mapRef.current  = map
    drawRef.current = draw

    return () => { map.remove() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update service area layers when list changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReady) return

    // Remove old layers/sources
    serviceAreas.forEach((area) => {
      const sourceId = `sa-${area.id}`
      if (map.getLayer(`${sourceId}-stroke`)) map.removeLayer(`${sourceId}-stroke`)
      if (map.getLayer(`${sourceId}-fill`))   map.removeLayer(`${sourceId}-fill`)
      if (map.getSource(sourceId))            map.removeSource(sourceId)
    })

    // Re-add all
    serviceAreas.forEach((area) => {
      const cfg      = SERVICE_AREA_MODE_CONFIG[area.mode]
      const sourceId = `sa-${area.id}`
      const isEditing = area.id === editingId

      map.addSource(sourceId, {
        type: "geojson",
        data: { type: "Feature", geometry: area.boundaries as GeoJSON.Geometry, properties: {} },
      })
      map.addLayer({
        id    : `${sourceId}-fill`,
        type  : "fill",
        source: sourceId,
        paint : {
          "fill-color"  : cfg.color,
          "fill-opacity": isEditing ? 0.25 : 0.15,
        },
      })
      map.addLayer({
        id    : `${sourceId}-stroke`,
        type  : "line",
        source: sourceId,
        paint : {
          "line-color": cfg.color,
          "line-width": isEditing ? 2.5 : 1.5,
        },
      })
    })
  }, [serviceAreas, isReady, editingId])

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
                        rounded-xl px-3 py-2 text-xs text-muted-foreground shadow-sm pointer-events-none">
          Select a mode from the panel, then draw a polygon on the map.
        </div>
      )}
    </div>
  )
}