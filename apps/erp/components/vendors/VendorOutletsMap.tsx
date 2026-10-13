"use client"

import { useEffect, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"

export interface MappableOutlet {
  id: string
  name: string
  latitude: number
  longitude: number
  adminStatus: string
  city: { name: string } | null
}

interface Props {
  outlets: MappableOutlet[]
}

const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "var(--success)",
  SUSPENDED: "var(--warning)",
  BANNED: "var(--destructive)",
}

/**
 * Read-only multi-marker map of a vendor's outlets — one pin per outlet,
 * fit-bounds to all of them, a popup with name/city/status on click. Not a
 * moderation surface (see CityLocationMap for the single-pin picker used
 * during city creation); outlet administration itself stays deferred, this
 * only visualizes what already exists.
 */
export function VendorOutletsMap({ outlets }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current || outlets.length === 0) return

    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [outlets[0]!.longitude, outlets[0]!.latitude],
      zoom: outlets.length === 1 ? 12 : 3,
      attributionControl: false,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
    map.addControl(new mapboxgl.AttributionControl({ compact: true }))

    map.on("load", () => {
      setReady(true)

      const markers: mapboxgl.Marker[] = []
      outlets.forEach((o) => {
        const color = STATUS_COLOR[o.adminStatus] ?? "var(--primary)"
        const popup = new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
          `<div style="font: 500 12.5px system-ui; padding: 2px 1px;">
             <div style="font-weight:600;">${escapeHtml(o.name)}</div>
             <div style="color:#6b7280; margin-top:2px;">${escapeHtml(o.city?.name ?? "—")}</div>
           </div>`,
        )
        const marker = new mapboxgl.Marker({ color })
          .setLngLat([o.longitude, o.latitude])
          .setPopup(popup)
          .addTo(map)
        markers.push(marker)
      })

      if (outlets.length > 1) {
        const bounds = new mapboxgl.LngLatBounds()
        outlets.forEach((o) => bounds.extend([o.longitude, o.latitude]))
        map.fitBounds(bounds, { padding: 56, maxZoom: 12, duration: 0 })
      }
    })

    const resizeObserver = new ResizeObserver(() => mapRef.current?.resize())
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once per outlet set; the detail page doesn't mutate outlets live.
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
    <div className="relative h-64 w-full overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-xs)] sm:h-80">
      <div ref={containerRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}
