"use client"

import * as React from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { MapPinned } from "lucide-react"
import type { CityViewport } from "@repo/types/customer-app"

/*
 * The map the customer drops their delivery pin on.
 *
 * ── It shows a place; it decides nothing ───────────────────────────────────
 *
 * No boundary, no zone polygon and no coverage colouring is drawn here. The
 * vendor dashboard's picker does draw them, and it should — a merchant is
 * choosing where to build a business and needs to see the operating map. A
 * customer is choosing where their dinner goes, and publishing the zone
 * geometry to an anonymous page would hand over the coverage footprint exactly
 * rather than roughly, which is the same boundary `areas` (names only) exists
 * to hold. The verdict comes back from the server for the exact point
 * submitted.
 *
 * ── The viewport is NOT the pin ────────────────────────────────────────────
 *
 * The city's centroid opens the view. It never becomes a marker, and this
 * component has no way to report a point the customer did not place: `onPick`
 * fires from a click or a drag, and from nothing else. Until then the page
 * holds no coordinates at all.
 *
 * Loaded through next/dynamic with `ssr: false` by the workbench — mapbox-gl
 * is ~1.8 MB and touches `window` at import time.
 */

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

/** A city-sized view when there is nothing better to fit to. */
const DEFAULT_ZOOM = 12

export interface DeliveryMapProps {
  viewport: CityViewport
  /** The confirmed-or-pending pin, or null while the customer has placed none. */
  point   : { latitude: number; longitude: number } | null
  onPick  : (latitude: number, longitude: number) => void
}

export default function DeliveryMap({ viewport, point, onPick }: DeliveryMapProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const mapRef       = React.useRef<mapboxgl.Map | null>(null)
  const markerRef    = React.useRef<mapboxgl.Marker | null>(null)

  /* Kept in a ref so the map's listeners — bound once, on mount — always call
   * the newest handler without tearing the map down and rebuilding it. */
  const pickRef = React.useRef(onPick)
  React.useEffect(() => { pickRef.current = onPick }, [onPick])

  React.useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return

    mapboxgl.accessToken = TOKEN

    const center: [number, number] = point
      ? [point.longitude, point.latitude]
      : viewport.center
        ? [viewport.center.longitude, viewport.center.latitude]
        : [0, 0]

    const map = new mapboxgl.Map({
      container         : containerRef.current,
      style             : "mapbox://styles/mapbox/streets-v12",
      center,
      zoom              : DEFAULT_ZOOM,
      attributionControl: false,
    })

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
    map.addControl(new mapboxgl.AttributionControl({ compact: true }))

    /* Fit the city's box only when the customer has no pin yet. Someone
     * returning to change an address should land on THEIR point, not be
     * zoomed back out to the whole city. */
    if (!point && viewport.bounds) {
      const { north, south, east, west } = viewport.bounds
      map.fitBounds([[west, south], [east, north]], { padding: 40, animate: false })
    }

    map.on("click", (event) => {
      pickRef.current(event.lngLat.lat, event.lngLat.lng)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // Mount only. The viewport belongs to the route and cannot change under us,
    // and `point` is read once here to decide the opening view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* The marker follows the point, wherever it came from — a tap on the map, a
   * drag of the pin, or the browser's own location. One direction of flow:
   * state owns the point, the marker renders it. */
  React.useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!point) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }

    const lngLat: [number, number] = [point.longitude, point.latitude]

    if (!markerRef.current) {
      const marker = new mapboxgl.Marker({ draggable: true, color: "#e26b09" })
        .setLngLat(lngLat)
        .addTo(map)

      marker.on("dragend", () => {
        const { lat, lng } = marker.getLngLat()
        pickRef.current(lat, lng)
      })

      markerRef.current = marker
    } else {
      markerRef.current.setLngLat(lngLat)
    }

    map.easeTo({ center: lngLat, duration: 400 })
  }, [point])

  if (!TOKEN) {
    /* A missing token is a deployment concern, and it must not take the page
     * down with it: "use my current location" still works without a map. */
    return (
      <div className="surface flex h-full min-h-[20rem] flex-col items-center justify-center gap-3 p-6 text-center">
        <MapPinned aria-hidden className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          The map is unavailable right now. You can still use your current location.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Map — tap to place your delivery pin"
      className="h-full min-h-[20rem] w-full overflow-hidden rounded-2xl border border-border"
    />
  )
}
