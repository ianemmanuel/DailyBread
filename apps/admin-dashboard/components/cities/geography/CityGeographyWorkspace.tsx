"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import mapboxgl from "mapbox-gl"
import MapboxDraw from "@mapbox/mapbox-gl-draw"
import "mapbox-gl/dist/mapbox-gl.css"
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"
import { toast } from "sonner"
import {
  Loader2, Search, Pencil, Plus, Trash2, MapPin, Layers, X, Check, Monitor,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import type { Zone, ZoneLevel } from "@repo/types/admin-app"
import {
  ZONE_LEVEL_META, ZONE_LEVEL_ORDER, ZONE_STATUS_META, zoneLevelColorExpression,
} from "./zone-meta"
import { ZoneEditPanel } from "./ZoneEditPanel"

type Poly = GeoJSON.Polygon | GeoJSON.MultiPolygon

interface Props {
  citySlug             : string
  cityName             : string
  cityStatus           : string
  countryCode          : string | null
  centroid             : { latitude: number | null; longitude: number | null }
  initialBoundary      : Poly | null
  initialBoundarySource: "OSM" | "MANUAL" | null
  initialOsmId         : string | null
  initialZones         : Zone[]
  canWriteBoundary     : boolean
  canWriteZones        : boolean
  canSetLevel          : boolean
}

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

const BASEMAPS = {
  minimal  : { label: "Minimal",   style: "mapbox://styles/mapbox/light-v11" },
  streets  : { label: "Streets",   style: "mapbox://styles/mapbox/streets-v12" },
  satellite: { label: "Satellite", style: "mapbox://styles/mapbox/satellite-streets-v12" },
} as const
type Basemap = keyof typeof BASEMAPS

type Mode =
  | "view"
  | "boundary:draw"
  | "boundary:edit"
  | "zone:draw"
  | "zone:edit"

// ─── geometry helpers ─────────────────────────────────────────────────────────

function eachPosition(geom: Poly, fn: (lng: number, lat: number) => void) {
  const rings = geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat()
  for (const ring of rings) for (const [lng, lat] of ring) fn(lng, lat)
}

function boundsOf(geom: Poly): mapboxgl.LngLatBounds {
  const b = new mapboxgl.LngLatBounds()
  eachPosition(geom, (lng, lat) => b.extend([lng, lat]))
  return b
}

function zonesToFC(zones: Zone[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: zones.map((z) => ({
      type: "Feature",
      id: z.id,
      properties: { id: z.id, name: z.name, level: z.level, status: z.operationalStatus },
      geometry: z.boundaries as unknown as Poly,
    })),
  }
}

function polyFC(geom: Poly | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: geom ? [{ type: "Feature", properties: {}, geometry: geom }] : [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function CityGeographyWorkspace(props: Props) {
  const {
    citySlug, cityName, cityStatus, countryCode, centroid,
    initialBoundary, initialBoundarySource, initialOsmId, initialZones,
    canWriteBoundary, canWriteZones, canSetLevel,
  } = props

  const router = useRouter()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const drawRef = useRef<MapboxDraw | null>(null)

  const [ready, setReady] = useState(false)
  const [basemap, setBasemap] = useState<Basemap>("minimal")
  const [mode, setMode] = useState<Mode>("view")
  const modeRef = useRef<Mode>("view")
  modeRef.current = mode

  // Boundary/zone drawing is a desktop task — matches how Uber Eats/DoorDash
  // internal geo tooling works. On smaller screens the map + drawing tools are
  // hidden; the zone list and its status/level actions stay usable (an on-call
  // ops lead can still suspend a zone from a phone during an incident).
  const [isDesktop, setIsDesktop] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px) and (pointer: fine)")
    const apply = () => setIsDesktop(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  const [boundary, setBoundary] = useState<Poly | null>(initialBoundary)
  const [boundarySource, setBoundarySource] = useState<"OSM" | "MANUAL" | null>(initialBoundarySource)
  const [osmId, setOsmId] = useState<string | null>(initialOsmId)

  // Zones are refreshed by router.refresh() → new initialZones prop.
  const [zones, setZones] = useState<Zone[]>(initialZones)
  useEffect(() => { setZones(initialZones) }, [initialZones])
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null

  const [preview, setPreview] = useState<{ geom: Poly; osmId: string; displayName: string } | null>(null)
  const [searchQ, setSearchQ] = useState(cityName)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)

  // zone-create form (shown after a zone polygon is drawn)
  const [zoneDraft, setZoneDraft] = useState<Poly | null>(null)
  const [zoneName, setZoneName] = useState("")
  const [zoneLevel, setZoneLevel] = useState<ZoneLevel>("REGISTRATION_ONLY")

  // ── layer management ──────────────────────────────────────────────────────
  // paintLayers must be able to run at any time (initial load AND after every
  // basemap switch, which wipes custom layers) with the *current* data — so it
  // reads refs, not closure state.

  const zonesFC = useMemo(() => zonesToFC(zones), [zones])

  const boundaryRef = useRef<Poly | null>(initialBoundary)
  const previewRef  = useRef<Poly | null>(null)
  const zonesFcRef  = useRef<GeoJSON.FeatureCollection>(zonesFC)
  const selectedRef = useRef<string | null>(null)
  boundaryRef.current = boundary
  previewRef.current  = preview?.geom ?? null
  zonesFcRef.current  = zonesFC
  selectedRef.current = selectedZoneId

  const paintLayers = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    const ensureSource = (id: string, data: GeoJSON.FeatureCollection) => {
      const existing = map.getSource(id) as mapboxgl.GeoJSONSource | undefined
      if (existing) existing.setData(data)
      else map.addSource(id, { type: "geojson", data })
    }

    ensureSource("city-boundary", polyFC(boundaryRef.current))
    ensureSource("preview-boundary", polyFC(previewRef.current))
    ensureSource("zones", zonesFcRef.current)

    if (!map.getLayer("zones-fill")) {
      map.addLayer({
        id: "zones-fill", type: "fill", source: "zones",
        paint: { "fill-color": zoneLevelColorExpression(), "fill-opacity": 0.18 },
      })
    }
    if (!map.getLayer("zones-line")) {
      map.addLayer({
        id: "zones-line", type: "line", source: "zones",
        paint: { "line-color": zoneLevelColorExpression(), "line-width": 2 },
      })
    }
    if (!map.getLayer("zones-highlight")) {
      map.addLayer({
        id: "zones-highlight", type: "line", source: "zones",
        paint: { "line-color": "#4f46e5", "line-width": 4 },
        filter: ["==", ["get", "id"], selectedRef.current ?? "__none__"],
      })
    }
    if (!map.getLayer("zones-label")) {
      map.addLayer({
        id: "zones-label", type: "symbol", source: "zones",
        layout: {
          "text-field": ["get", "name"], "text-size": 12,
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        },
        paint: { "text-color": "#0f172a", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      })
    }
    if (!map.getLayer("city-boundary-fill")) {
      map.addLayer({
        id: "city-boundary-fill", type: "fill", source: "city-boundary",
        paint: { "fill-color": "#6366f1", "fill-opacity": 0.05 },
      })
    }
    if (!map.getLayer("city-boundary-line")) {
      map.addLayer({
        id: "city-boundary-line", type: "line", source: "city-boundary",
        paint: { "line-color": "#4f46e5", "line-width": 2.5, "line-dasharray": [1, 0] },
      })
    }
    if (!map.getLayer("preview-boundary-line")) {
      map.addLayer({
        id: "preview-boundary-line", type: "line", source: "preview-boundary",
        paint: { "line-color": "#0891b2", "line-width": 2, "line-dasharray": [2, 1.5] },
      })
    }
  }, [])

  // ── init map once ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return
    mapboxgl.accessToken = TOKEN

    const hasCentroid = centroid.latitude != null && centroid.longitude != null
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: BASEMAPS.minimal.style,
      center: hasCentroid ? [centroid.longitude!, centroid.latitude!] : [20, 5],
      zoom: hasCentroid ? 10 : 2,
      attributionControl: false,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
    map.addControl(new mapboxgl.AttributionControl({ compact: true }))

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
    })
    drawRef.current = draw
    map.addControl(draw as unknown as mapboxgl.IControl)

    map.on("load", () => {
      paintLayers()
      if (initialBoundary) map.fitBounds(boundsOf(initialBoundary), { padding: 48, duration: 0 })
      setReady(true)
    })
    // Re-add custom layers after a basemap switch wipes them.
    map.on("style.load", () => { if (mapRef.current) paintLayers() })

    map.on("draw.create", (e: { features: GeoJSON.Feature[] }) => {
      const geom = e.features[0]?.geometry as Poly | undefined
      if (!geom) return
      if (modeRef.current === "zone:draw") {
        setZoneDraft(geom)
      }
      // boundary:draw keeps the feature in Draw until the user hits Save
    })

    // Select / deselect a zone by clicking the map (view mode only).
    map.on("click", (e) => {
      if (modeRef.current !== "view" || !map.getLayer("zones-fill")) return
      const hit = map.queryRenderedFeatures(e.point, { layers: ["zones-fill"] })[0]
      const id = hit?.properties?.["id"]
      setSelectedZoneId(typeof id === "string" ? id : null)
    })
    map.on("mouseenter", "zones-fill", () => {
      if (modeRef.current === "view") map.getCanvas().style.cursor = "pointer"
    })
    map.on("mouseleave", "zones-fill", () => { map.getCanvas().style.cursor = "" })

    const ro = new ResizeObserver(() => mapRef.current?.resize())
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      drawRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once
  }, [])

  // keep static layers in sync when data changes outside a style reload
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource("city-boundary") as mapboxgl.GeoJSONSource | undefined)?.setData(polyFC(boundary))
    ;(map.getSource("preview-boundary") as mapboxgl.GeoJSONSource | undefined)?.setData(polyFC(preview?.geom ?? null))
    ;(map.getSource("zones") as mapboxgl.GeoJSONSource | undefined)?.setData(zonesFC)
  }, [boundary, preview, zonesFC, ready])

  // selected-zone highlight
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.getLayer("zones-highlight")) return
    map.setFilter("zones-highlight", ["==", ["get", "id"], selectedZoneId ?? "__none__"])
  }, [selectedZoneId, ready])

  // hide the boundary layer while drawing/editing it; hide the one zone whose
  // shape is being edited (Draw shows the editable copy instead)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const editingBoundary = mode === "boundary:draw" || mode === "boundary:edit"
    for (const id of ["city-boundary-fill", "city-boundary-line"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", editingBoundary ? "none" : "visible")
    }
    const hiddenZone = mode === "zone:edit" ? (selectedZoneId ?? "__none__") : "__none__"
    for (const id of ["zones-fill", "zones-line", "zones-label"]) {
      if (map.getLayer(id)) map.setFilter(id, ["!=", ["get", "id"], hiddenZone])
    }
  }, [mode, selectedZoneId, ready])

  function switchBasemap(next: Basemap) {
    if (mode !== "view") return
    setBasemap(next)
    mapRef.current?.setStyle(BASEMAPS[next].style)
  }

  // ── mode transitions ──────────────────────────────────────────────────────

  const exitEditing = useCallback(() => {
    drawRef.current?.deleteAll()
    drawRef.current?.changeMode("simple_select")
    setZoneDraft(null)
    setZoneName("")
    setZoneLevel("REGISTRATION_ONLY")
    setMode("view")
  }, [])

  function startDrawBoundary() {
    setPreview(null)
    drawRef.current?.deleteAll()
    setMode("boundary:draw")
    drawRef.current?.changeMode("draw_polygon")
  }

  function startEditBoundary(geom: Poly) {
    setPreview(null)
    const draw = drawRef.current
    if (!draw) return
    draw.deleteAll()
    if (geom.type === "Polygon") {
      draw.add({ type: "Feature", properties: {}, geometry: geom })
    } else {
      for (const coords of geom.coordinates) {
        draw.add({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: coords } })
      }
    }
    setMode("boundary:edit")
    draw.changeMode("simple_select")
  }

  function startDrawZone() {
    if (!boundary) {
      toast.error("Set the city boundary before adding zones")
      return
    }
    setPreview(null)
    setSelectedZoneId(null)
    drawRef.current?.deleteAll()
    setMode("zone:draw")
    drawRef.current?.changeMode("draw_polygon")
  }

  function startEditZoneShape() {
    const zone = zones.find((z) => z.id === selectedZoneId)
    const draw = drawRef.current
    if (!zone || !draw) return
    const geom = zone.boundaries as unknown as Poly
    draw.deleteAll()
    if (geom.type === "Polygon") {
      draw.add({ type: "Feature", properties: {}, geometry: geom })
    } else {
      for (const coords of geom.coordinates) {
        draw.add({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: coords } })
      }
    }
    setMode("zone:edit")
    draw.changeMode("simple_select")
  }

  async function saveZoneShape() {
    const zone = zones.find((z) => z.id === selectedZoneId)
    if (!zone) return
    const feats = drawRef.current?.getAll().features ?? []
    if (feats.length === 0) { toast.error("Draw a polygon first"); return }
    const geom: Poly = feats.length === 1
      ? (feats[0]!.geometry as Poly)
      : { type: "MultiPolygon", coordinates: feats.map((f) => (f.geometry as GeoJSON.Polygon).coordinates) }
    setSaving(true)
    try {
      const res = await fetch(`/api/zones/${zone.id}?cityRef=${citySlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boundary: geom }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error("Couldn't save the zone shape", { description: data?.message ?? "Please try again." })
        return
      }
      toast.success("Zone shape updated")
      exitEditing()
      router.refresh()
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setSaving(false)
    }
  }

  // ── OSM search ────────────────────────────────────────────────────────────

  async function runOsmSearch() {
    if (!countryCode) {
      toast.error("This city's country has no ISO code — draw the boundary manually")
      return
    }
    setSearching(true)
    try {
      const url = `/api/cities/${citySlug}/boundary/osm-preview?q=${encodeURIComponent(searchQ.trim())}&countryCode=${countryCode}`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok || !data) {
        toast.error("No boundary found", { description: data?.message ?? "Try a different name or draw it manually." })
        return
      }
      const geom = data.boundary as Poly
      setPreview({ geom, osmId: String(data.osmId), displayName: data.displayName })
      mapRef.current?.fitBounds(boundsOf(geom), { padding: 48, duration: 400 })
    } catch {
      toast.error("Search failed", { description: "Please try again." })
    } finally {
      setSearching(false)
    }
  }

  // ── saves ─────────────────────────────────────────────────────────────────

  async function saveBoundary(geom: Poly, source: "OSM" | "MANUAL", withOsmId: string | null) {
    setSaving(true)
    try {
      const res = await fetch(`/api/cities/${citySlug}/boundary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boundary: geom, source, ...(withOsmId ? { osmId: withOsmId } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error("Couldn't save the boundary", { description: data?.message ?? "Please try again." })
        return
      }
      toast.success("City boundary saved")
      setBoundary(geom)
      setBoundarySource(source)
      setOsmId(withOsmId)
      setPreview(null)
      exitEditing()
      if (mapRef.current) mapRef.current.fitBounds(boundsOf(geom), { padding: 48, duration: 400 })
      router.refresh()
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setSaving(false)
    }
  }

  function saveBoundaryFromDraw() {
    const feats = drawRef.current?.getAll().features ?? []
    if (feats.length === 0) { toast.error("Draw a polygon first"); return }
    let geom: Poly
    if (feats.length === 1) {
      geom = feats[0]!.geometry as Poly
    } else {
      geom = {
        type: "MultiPolygon",
        coordinates: feats.map((f) => (f.geometry as GeoJSON.Polygon).coordinates),
      }
    }
    const source = mode === "boundary:edit" ? (boundarySource ?? "MANUAL") : "MANUAL"
    void saveBoundary(geom, source, source === "OSM" ? osmId : null)
  }

  async function clearBoundary() {
    setSaving(true)
    try {
      const res = await fetch(`/api/cities/${citySlug}/boundary`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        toast.error("Couldn't clear the boundary", { description: data?.message ?? "Please try again." })
        return
      }
      toast.success("City boundary cleared")
      setBoundary(null)
      setBoundarySource(null)
      setOsmId(null)
      setClearOpen(false)
      router.refresh()
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setSaving(false)
    }
  }

  async function createZone() {
    if (!zoneDraft) return
    if (!zoneName.trim()) { toast.error("Give the zone a name"); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/cities/${citySlug}/zones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: zoneName.trim(), boundary: zoneDraft, level: zoneLevel }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error("Couldn't create the zone", { description: data?.message ?? "Please try again." })
        return
      }
      toast.success(`Zone "${zoneName.trim()}" created`)
      exitEditing()
      router.refresh()
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setSaving(false)
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  if (!TOKEN) {
    return (
      <div className="admin-card flex h-64 items-center justify-center text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          Map unavailable — <code>NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> isn&apos;t configured.
        </p>
      </div>
    )
  }

  const editing = mode !== "view"

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      {!isDesktop && (
        <div className="admin-card flex items-start gap-3 border-primary/30 bg-primary-subtle/30">
          <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs text-muted-foreground">
            The map and boundary/zone drawing tools need a desktop screen. You can still review
            zones and change a zone&apos;s level or operational status below.
          </p>
        </div>
      )}

      {/* Map column */}
      <div className={isDesktop ? "flex flex-col gap-2" : "hidden"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-xs shadow-[var(--shadow-xs)]">
            {(Object.keys(BASEMAPS) as Basemap[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => switchBasemap(k)}
                disabled={editing}
                className={[
                  "rounded-full px-3 py-1 font-medium transition-colors disabled:opacity-40",
                  basemap === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {BASEMAPS[k].label}
              </button>
            ))}
          </div>
          {editing && (
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-subtle px-3 py-1 text-xs font-medium text-primary-subtle-fg">
              <Layers className="h-3.5 w-3.5" />
              {mode === "zone:draw" && "Click the map to outline the zone"}
              {mode === "zone:edit" && "Drag vertices to reshape, then save"}
              {mode === "boundary:draw" && "Click to place points, double-click to finish"}
              {mode === "boundary:edit" && "Drag vertices to adjust, then save"}
              <button type="button" onClick={exitEditing} className="ml-1 rounded-full p-0.5 hover:bg-black/5">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="relative h-[560px] w-full overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-xs)]">
          <div ref={containerRef} className="h-full w-full" />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {/* Save bar while editing the boundary */}
          {(mode === "boundary:draw" || mode === "boundary:edit") && (
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-end gap-2 rounded-xl border border-border bg-card/95 p-2 backdrop-blur">
              <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={exitEditing} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" size="sm" className="rounded-full gap-1.5" onClick={saveBoundaryFromDraw} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save boundary
              </Button>
            </div>
          )}

          {/* Save bar while reshaping a zone */}
          {mode === "zone:edit" && (
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-xl border border-border bg-card/95 p-2 backdrop-blur">
              <span className="pl-1 text-xs font-medium text-muted-foreground">
                Reshaping {selectedZone?.name}
              </span>
              <span className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={exitEditing} disabled={saving}>
                  Cancel
                </Button>
                <Button type="button" size="sm" className="rounded-full gap-1.5" onClick={saveZoneShape} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save shape
                </Button>
              </span>
            </div>
          )}

          {/* Zone details after drawing */}
          {mode === "zone:draw" && zoneDraft && (
            <div className="absolute inset-x-3 bottom-3 space-y-2 rounded-xl border border-border bg-card/95 p-3 backdrop-blur">
              <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="zone-name">Zone name</Label>
                  <Input id="zone-name" value={zoneName} onChange={(e) => setZoneName(e.target.value)}
                    placeholder="e.g. Central Business District" className="h-9 rounded-lg text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Capability level</Label>
                  <Select value={zoneLevel} onValueChange={(v) => setZoneLevel(v as ZoneLevel)}>
                    <SelectTrigger className="h-9 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ZONE_LEVEL_ORDER.map((lv) => (
                        <SelectItem key={lv} value={lv}>
                          {ZONE_LEVEL_META[lv].short} · {ZONE_LEVEL_META[lv].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{ZONE_LEVEL_META[zoneLevel].description}</p>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={exitEditing} disabled={saving}>
                  Cancel
                </Button>
                <Button type="button" size="sm" className="rounded-full gap-1.5" onClick={createZone} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Create zone
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Side panel */}
      <div className="flex flex-col gap-4">
        {/* Boundary card */}
        <div className="admin-card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MapPin className="h-4 w-4 text-primary" /> Operational boundary
            </h2>
            {boundary
              ? <span className="badge-success">Set{boundarySource ? ` · ${boundarySource}` : ""}</span>
              : <span className="badge-neutral">Not set</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            The maximum area where outlets may register. Outside it is delivery-destination
            space only.
          </p>

          {canWriteBoundary && !editing && isDesktop && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="City name for OpenStreetMap"
                  className="h-9 rounded-lg text-sm"
                />
                <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 rounded-lg gap-1.5"
                  onClick={runOsmSearch} disabled={searching || !countryCode}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Search
                </Button>
              </div>
              {!countryCode && (
                <p className="text-xs text-warning">No ISO country code for this city — draw manually.</p>
              )}

              {preview && (
                <div className="rounded-lg border border-cyan-200 bg-cyan-50/60 p-2.5 text-xs">
                  <p className="font-medium text-cyan-900">{preview.displayName}</p>
                  <p className="mt-0.5 text-cyan-700">Preview shown on the map (dashed outline).</p>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="sm" className="h-7 rounded-full text-xs"
                      onClick={() => void saveBoundary(preview.geom, "OSM", preview.osmId)} disabled={saving}>
                      Save as-is
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-7 rounded-full text-xs"
                      onClick={() => { setBoundarySource("OSM"); setOsmId(preview.osmId); startEditBoundary(preview.geom) }}>
                      Adjust first
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {boundary && (
                  <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5"
                    onClick={() => startEditBoundary(boundary)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5"
                  onClick={startDrawBoundary}>
                  <Pencil className="h-3.5 w-3.5" /> Draw manually
                </Button>
                {boundary && (
                  <Button type="button" variant="ghost" size="sm"
                    className="rounded-full gap-1.5 text-destructive hover:bg-destructive-bg"
                    onClick={() => setClearOpen(true)}>
                    <Trash2 className="h-3.5 w-3.5" /> Clear
                  </Button>
                )}
              </div>
            </div>
          )}
          {canWriteBoundary && !isDesktop && (
            <p className="text-xs text-muted-foreground">Boundary changes are done from a desktop.</p>
          )}
          {!canWriteBoundary && (
            <p className="text-xs text-muted-foreground">
              You have read-only access to the boundary (needs <code>settings:geography:write</code>).
            </p>
          )}
        </div>

        {/* Zones card */}
        <div className="admin-card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Layers className="h-4 w-4 text-primary" /> Zones
              <span className="text-xs font-normal text-muted-foreground">({zones.length})</span>
            </h2>
            {canWriteZones && !editing && isDesktop && (
              <Button type="button" size="sm" className="h-8 rounded-full gap-1.5" onClick={startDrawZone} disabled={!boundary}>
                <Plus className="h-3.5 w-3.5" /> Add zone
              </Button>
            )}
          </div>

          {!boundary && (
            <p className="text-xs text-muted-foreground">Set the boundary first — zones live inside it.</p>
          )}

          {/* legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {ZONE_LEVEL_ORDER.map((lv) => (
              <span key={lv} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: ZONE_LEVEL_META[lv].color }} />
                {ZONE_LEVEL_META[lv].short}
              </span>
            ))}
          </div>

          {selectedZone && !editing && (
            <ZoneEditPanel
              key={selectedZone.id}
              zone={selectedZone}
              citySlug={citySlug}
              canWriteZones={canWriteZones}
              canSetLevel={canSetLevel}
              canEditShape={isDesktop}
              onEditShape={startEditZoneShape}
              onClose={() => setSelectedZoneId(null)}
            />
          )}

          <div className="space-y-1.5">
            {zones.length === 0 && boundary && (
              <p className="text-xs text-muted-foreground">No zones yet.</p>
            )}
            {[...zones]
              .sort((a, b) => ZONE_LEVEL_META[b.level].order - ZONE_LEVEL_META[a.level].order || a.name.localeCompare(b.name))
              .map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => {
                    setSelectedZoneId(z.id)
                    const g = z.boundaries as unknown as Poly
                    mapRef.current?.fitBounds(boundsOf(g), { padding: 64, duration: 400 })
                  }}
                  className={[
                    "flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-muted/40",
                    z.id === selectedZoneId ? "border-primary/50 bg-muted/30" : "border-border hover:border-primary/40",
                  ].join(" ")}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: ZONE_LEVEL_META[z.level].color }} />
                      <span className="truncate text-sm font-medium text-foreground">{z.name}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {ZONE_LEVEL_META[z.level].label}
                      {z._count ? ` · ${z._count.outlets} outlet${z._count.outlets === 1 ? "" : "s"}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {z.operationalStatus !== "ACTIVE" && (
                      <span className={ZONE_STATUS_META[z.operationalStatus].badgeCls}>
                        {ZONE_STATUS_META[z.operationalStatus].label}
                      </span>
                    )}
                    {z.status === "INACTIVE" && <span className="badge-neutral">Retired</span>}
                  </span>
                </button>
              ))}
          </div>

          {zones.length > 0 && !selectedZone && (
            <p className="pt-1 text-[11px] text-muted-foreground">Select a zone on the map or list to manage it.</p>
          )}
          {!canSetLevel && canWriteZones && (
            <p className="text-[11px] text-muted-foreground">
              You can draw and reshape zones but not change capability levels (needs <code>settings:zones:set_level</code>).
            </p>
          )}
        </div>

        {cityStatus !== "ACTIVE" && (
          <p className="text-xs text-warning">
            This city is inactive — zone changes are blocked until it&apos;s reactivated.
          </p>
        )}
      </div>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-danger h-11 w-11"><Trash2 className="h-5 w-5" /></div>
            <AlertDialogTitle>Clear the {cityName} boundary?</AlertDialogTitle>
            <AlertDialogDescription>
              Outlets can no longer be placed against a boundary check until a new one is set.
              All zones must be deleted first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setClearOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" className="rounded-full gap-1.5" onClick={clearBoundary} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Clear boundary
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
