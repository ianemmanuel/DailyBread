"use client"

import { useEffect, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { MapPin } from "lucide-react"

interface Props {
  countryName: string
  latitude   : number | null
  longitude  : number | null
  onChange   : (lat: number, lng: number) => void
}

const DEFAULT_CENTER: [number, number] = [20, 10] // mid-Atlantic-ish — used only until the country geocode resolves
const DEFAULT_ZOOM = 1.4

const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

/**
 * Single-pin picker for a city's centroid — click or drag the marker,
 * lat/lng is reported via onChange. Best-effort centers on the country via
 * Mapbox's own Geocoding API (same public token, no extra dependency) on
 * first load; falls back to a wide world view if that lookup fails.
 *
 * The map instance is created exactly once (guarded against React 18
 * StrictMode's double-invoked effects in dev, which would otherwise spin
 * up two WebGL contexts on the same canvas and cause exactly the
 * hangs/glitches this needs to avoid) and torn down on unmount. A
 * ResizeObserver keeps it correctly sized through sidebar collapses,
 * container reflows, and orientation changes — Mapbox GL doesn't notice
 * container resizes on its own.
 */
export function CityLocationMap({ countryName, latitude, longitude, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef        = useRef<mapboxgl.Map | null>(null)
  const markerRef      = useRef<mapboxgl.Marker | null>(null)
  const onChangeRef    = useRef(onChange)
  onChangeRef.current  = onChange

  const [ready, setReady] = useState(false)

  function placeMarker(lng: number, lat: number, map: mapboxgl.Map) {
    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: "var(--primary)", draggable: true })
        .setLngLat([lng, lat])
        .addTo(map)
      markerRef.current.on("dragend", () => {
        const pos = markerRef.current!.getLngLat()
        onChangeRef.current(pos.lat, pos.lng)
      })
    } else {
      markerRef.current.setLngLat([lng, lat])
    }
  }

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return

    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style    : "mapbox://styles/mapbox/light-v11",
      center   : latitude != null && longitude != null ? [longitude, latitude] : DEFAULT_CENTER,
      zoom     : latitude != null && longitude != null ? 11 : DEFAULT_ZOOM,
      attributionControl: false,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
    map.addControl(new mapboxgl.AttributionControl({ compact: true }))

    // Owned by the effect (not the "load" handler) so the cleanup below can
    // actually abort it — an event-handler callback has no cleanup semantics
    // of its own, a `return` inside map.on(...) is a no-op.
    const geocodeController = new AbortController()

    map.on("load", () => {
      setReady(true)

      if (latitude != null && longitude != null) {
        placeMarker(longitude, latitude, map)
        return
      }

      // Best-effort — center on the country. A failed/slow geocode just
      // leaves the wide default view; never blocks the map from being usable.
      fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(countryName)}.json?types=country&limit=1&access_token=${token}`,
        { signal: geocodeController.signal },
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const feature = data?.features?.[0]
          if (!feature || !mapRef.current) return
          if (feature.bbox) {
            mapRef.current.fitBounds(feature.bbox as [number, number, number, number], { padding: 40, duration: 0 })
          } else if (feature.center) {
            mapRef.current.jumpTo({ center: feature.center as [number, number], zoom: 5 })
          }
        })
        .catch(() => {})
    })

    map.on("click", (e) => {
      placeMarker(e.lngLat.lng, e.lngLat.lat, map)
      onChangeRef.current(e.lngLat.lat, e.lngLat.lng)
    })

    const resizeObserver = new ResizeObserver(() => mapRef.current?.resize())
    resizeObserver.observe(containerRef.current)

    return () => {
      geocodeController.abort()
      resizeObserver.disconnect()
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once. latitude/longitude/countryName are only meaningful at mount (this is a create-only flow with no live prop updates after); onChange is called through onChangeRef so it's always current.
  }, [])

  if (!token) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 text-center sm:h-80">
        <p className="max-w-xs text-sm text-muted-foreground">
          Map unavailable — NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN isn't configured.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative h-64 w-full overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-xs)] sm:h-80 md:h-96">
        <div ref={containerRef} className="h-full w-full" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        {latitude != null && longitude != null
          ? `Pinned at ${latitude.toFixed(5)}, ${longitude.toFixed(5)} — click elsewhere or drag the pin to adjust.`
          : "Click the map to place the city's pin."}
      </p>
    </div>
  )
}
