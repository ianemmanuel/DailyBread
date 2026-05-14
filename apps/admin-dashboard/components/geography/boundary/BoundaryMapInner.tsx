
// This file is NEVER imported directly — always via dynamic() with ssr:false.
// It requires window/document and cannot run on the server.
"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import mapboxgl from "mapbox-gl"
import MapboxDraw from "@mapbox/mapbox-gl-draw"
import "mapbox-gl/dist/mapbox-gl.css"
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"
import type { CityBoundary } from "@repo/types/admin-app"

export interface BoundaryMapProps {
  /** Existing boundary to pre-load for editing — null means fresh draw */
  initialBoundary : CityBoundary | null
  /** Viewport center — city centroid or fallback */
  centroid        : { latitude: number; longitude: number } | null
  /** Called whenever the drawn polygon changes (or is deleted) */
  onBoundaryChange: (boundary: CityBoundary | null) => void
}

// Mapbox Draw custom styles — matches the admin design system
const DRAW_STYLES = [
  {
    id    : "gl-draw-polygon-fill",
    type  : "fill",
    filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
    paint : {
      "fill-color"  : "oklch(0.60 0.17 42)",
      "fill-opacity": 0.12,
    },
  },
  {
    id    : "gl-draw-polygon-stroke-active",
    type  : "line",
    filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
    paint : {
      "line-color"    : "oklch(0.60 0.17 42)",
      "line-width"    : 2,
      "line-dasharray": [2, 2],
    },
  },
  {
    id    : "gl-draw-polygon-fill-static",
    type  : "fill",
    filter: ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
    paint : {
      "fill-color"  : "oklch(0.60 0.17 42)",
      "fill-opacity": 0.10,
    },
  },
  {
    id    : "gl-draw-polygon-stroke-static",
    type  : "line",
    filter: ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
    paint : {
      "line-color": "oklch(0.60 0.17 42)",
      "line-width" : 2,
    },
  },
  {
    id    : "gl-draw-point-point-stroke-active",
    type  : "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "feature"]],
    paint : {
      "circle-radius"      : 5,
      "circle-color"       : "#fff",
      "circle-stroke-width": 2,
      "circle-stroke-color": "oklch(0.60 0.17 42)",
    },
  },
  {
    id    : "gl-draw-point-active",
    type  : "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "vertex"]],
    paint : {
      "circle-radius": 6,
      "circle-color" : "oklch(0.60 0.17 42)",
    },
  },
]

export default function BoundaryMapInner({
  initialBoundary,
  centroid,
  onBoundaryChange,
}: BoundaryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const drawRef      = useRef<MapboxDraw | null>(null)
  const [isReady, setIsReady] = useState(false)

  const extractBoundary = useCallback((): CityBoundary | null => {
    const draw = drawRef.current
    if (!draw) return null
    const all = draw.getAll()
    const feature = all.features[0]
    if (!feature) return null
    return feature.geometry as CityBoundary
  }, [])

  const handleDrawEvent = useCallback(() => {
    onBoundaryChange(extractBoundary())
  }, [extractBoundary, onBoundaryChange])

  useEffect(() => {
    if (!containerRef.current) return

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN!

    const defaultCenter: [number, number] = centroid
      ? [centroid.longitude, centroid.latitude]
      : [36.8219, -1.2921] // fallback: Nairobi

    const map = new mapboxgl.Map({
      container  : containerRef.current,
      style      : "mapbox://styles/mapbox/light-v11",
      center     : defaultCenter,
      zoom       : centroid ? 10 : 2,
      attributionControl: false,
    })

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right")

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon       : true,
        trash         : true,
      },
      styles: DRAW_STYLES,
    })

    map.addControl(draw as unknown as mapboxgl.IControl, "top-left")

    map.on("load", () => {
      // Load existing boundary into Draw for editing
      if (initialBoundary) {
        draw.add({
          type    : "Feature",
          geometry: initialBoundary,
          properties: {},
        })

        // Fit map to boundary extents
        try {
          const coords: [number, number][] =
            initialBoundary.type === "Polygon"
              ? initialBoundary.coordinates.flat()
              : initialBoundary.coordinates.flat(2)

          const lngs = coords.map(([lng]) => lng)
          const lats = coords.map(([, lat]) => lat)

          map.fitBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)],
            ],
            { padding: 60, duration: 800 },
          )
        } catch {
          // non-critical — map is still usable
        }
      }

      setIsReady(true)
    })

    map.on("draw.create", handleDrawEvent)
    map.on("draw.update", handleDrawEvent)
    map.on("draw.delete", handleDrawEvent)

    mapRef.current  = map
    drawRef.current = draw

    return () => {
      map.off("draw.create", handleDrawEvent)
      map.off("draw.update", handleDrawEvent)
      map.off("draw.delete", handleDrawEvent)
      map.remove()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — map initialises once

  // If initialBoundary changes (e.g. after OSM preview load), update Draw state
  useEffect(() => {
    const draw = drawRef.current
    if (!draw || !isReady) return

    draw.deleteAll()

    if (initialBoundary) {
      draw.add({
        type      : "Feature",
        geometry  : initialBoundary,
        properties: {},
      })

      // Re-fit bounds
      try {
        const map = mapRef.current
        if (!map) return

        const coords: [number, number][] =
          initialBoundary.type === "Polygon"
            ? initialBoundary.coordinates.flat()
            : initialBoundary.coordinates.flat(2)

        const lngs = coords.map(([lng]) => lng)
        const lats = coords.map(([, lat]) => lat)

        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 60, duration: 800 },
        )
      } catch {
        // non-critical
      }
    }

    onBoundaryChange(initialBoundary)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBoundary, isReady])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" />

      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-xl">
          <p className="text-sm text-muted-foreground animate-pulse">Initialising map…</p>
        </div>
      )}

      {/* Draw mode hint */}
      {isReady && (
        <div className="absolute top-3 right-3 bg-card/90 backdrop-blur-sm border border-border/60
                        rounded-xl px-3 py-2 text-xs text-muted-foreground shadow-sm pointer-events-none">
          Use the polygon tool (top-left) to draw or edit the city boundary.
        </div>
      )}
    </div>
  )
}