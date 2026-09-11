"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { Loader2, Search, LocateFixed, MapPin, X, Info } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import type { CityCoverage, OutletPlacement, ZoneBoundary } from "@repo/types/vendor-app"
import {
  PLACEMENT_META, PLACEMENT_LEGEND_ORDER, placementColorExpression, CAPABILITY_LABELS,
} from "./placement-meta"

/*
 * The outlet location picker.
 *
 * Replaces the old "copy your coordinates out of Google Maps" flow with a map
 * the vendor drops a pin on, and — the actual point of it — an immediate,
 * honest answer about what we can do at that spot. Uber Eats and DoorDash both
 * settle a merchant's address before anything else in onboarding, for the same
 * reason: everything downstream (delivery, coverage, go-live) depends on it.
 *
 * Authority stays server-side throughout. The polygons drawn here are only
 * pixels; the verdict beside them comes from the backend for the exact point
 * that will be submitted, and createOutlet re-checks it once more on save.
 * Nothing about the pin is trusted from this component.
 */

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

//* Long enough that dragging across a city is one request per pause, short
//* enough that the verdict still feels attached to the pin.
const PLACEMENT_DEBOUNCE_MS = 350

export interface AddressSuggestion {
  addressLine1?: string
  neighborhood?: string
  postalCode?  : string
}

interface Props {
  cityId    : string
  cityName? : string
  latitude  : number | null
  longitude : number | null
  onPick    : (latitude: number, longitude: number) => void
  /** `replace` is true for a deliberate search result, false for a dragged pin
   *  — a pin nudge should not overwrite an address the vendor already typed. */
  onAddressSuggested?: (parts: AddressSuggestion, replace: boolean) => void
  /** Lets the form block submission while the pin sits outside our coverage. */
  onPlacementChange? : (placement: OutletPlacement | null) => void
}

// ─── geometry helpers ─────────────────────────────────────────────────────────

function outerRings(geom: ZoneBoundary): [number, number][][] {
  return geom.type === "Polygon"
    ? [geom.coordinates[0] ?? []]
    : geom.coordinates.map((poly) => poly[0] ?? [])
}

function boundsOf(geom: ZoneBoundary): mapboxgl.LngLatBounds {
  const b = new mapboxgl.LngLatBounds()
  for (const ring of outerRings(geom)) for (const [lng, lat] of ring) b.extend([lng, lat])
  return b
}

/*
 * A world-sized polygon with the city boundary punched out of it. Dimming
 * everything we do not cover reads instantly — far better than an outline the
 * vendor has to trace to work out which side of it they are on.
 */
function maskFeature(boundary: ZoneBoundary): GeoJSON.Feature {
  const world: [number, number][] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]
  return {
    type      : "Feature",
    properties: {},
    geometry  : { type: "Polygon", coordinates: [world, ...outerRings(boundary)] },
  }
}

function zonesToFC(coverage: CityCoverage): GeoJSON.FeatureCollection {
  return {
    type    : "FeatureCollection",
    features: coverage.zones.map((z) => ({
      type      : "Feature",
      id        : z.id,
      properties: { id: z.id, name: z.name, status: z.status },
      geometry  : z.boundaries as unknown as GeoJSON.Geometry,
    })),
  }
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] }

// ─── geocoding ────────────────────────────────────────────────────────────────

interface GeocodeResult {
  id     : string
  name   : string
  context: string
  lat    : number
  lng    : number
  parts  : AddressSuggestion
}

/** Mapbox Places response, mapped onto the address fields the outlet form has. */
function toGeocodeResult(f: Record<string, unknown>): GeocodeResult {
  const ctx = (f.context as { id: string; text: string }[] | undefined) ?? []
  const of = (prefix: string) => ctx.find((c) => c.id.startsWith(prefix))?.text
  const center = f.center as [number, number]
  const text = String(f.text ?? "")

  return {
    id     : String(f.id),
    name   : text,
    context: String(f.place_name ?? "").split(", ").slice(1).join(", "),
    lat    : center[1],
    lng    : center[0],
    parts  : {
      addressLine1: f.address ? `${String(f.address)} ${text}` : text,
      neighborhood: of("neighborhood") ?? of("locality"),
      postalCode  : of("postcode"),
    },
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export function OutletLocationPicker({
  cityId, cityName, latitude, longitude, onPick, onAddressSuggested, onPlacementChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const markerRef    = useRef<mapboxgl.Marker | null>(null)

  const [mapLoaded, setMapLoaded]         = useState(false)
  const [coverage, setCoverage]           = useState<CityCoverage | null>(null)
  const [coverageError, setCoverageError] = useState(false)

  const [placement, setPlacement] = useState<OutletPlacement | null>(null)
  const [resolving, setResolving] = useState(false)

  const [query, setQuery]         = useState("")
  const [results, setResults]     = useState<GeocodeResult[]>([])
  const [searching, setSearching] = useState(false)

  /* Latest-wins guards. A vendor can drag the pin faster than the round trip,
   * and a late response for an abandoned position would show a verdict for a
   * place the marker no longer sits on. */
  const placementSeq = useRef(0)
  const searchSeq    = useRef(0)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── coverage ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!cityId) { setCoverage(null); return }
    let cancelled = false
    setCoverage(null)
    setCoverageError(false)

    fetch(`/api/cities/${cityId}/coverage`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return
        if (body?.status === "error" || !body?.data) { setCoverageError(true); return }
        setCoverage(body.data as CityCoverage)
      })
      .catch(() => { if (!cancelled) setCoverageError(true) })

    return () => { cancelled = true }
  }, [cityId])

  // ── placement verdict ──────────────────────────────────────────────────────

  const resolvePlacement = useCallback((lat: number, lng: number) => {
    if (!cityId) return
    const seq = ++placementSeq.current
    setResolving(true)

    fetch(`/api/cities/${cityId}/placement?latitude=${lat}&longitude=${lng}`)
      .then((r) => r.json())
      .then((body) => {
        if (seq !== placementSeq.current) return
        const next = body?.status === "error" ? null : (body?.data as OutletPlacement)
        setPlacement(next ?? null)
        onPlacementChange?.(next ?? null)
      })
      .catch(() => {
        if (seq !== placementSeq.current) return
        // A failed preview must never block the vendor — createOutlet is the
        // real gate and refuses an out-of-coverage pin on its own.
        setPlacement(null)
        onPlacementChange?.(null)
      })
      .finally(() => { if (seq === placementSeq.current) setResolving(false) })
  }, [cityId, onPlacementChange])

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    if (!TOKEN || !onAddressSuggested) return
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
        `?types=address,poi,neighborhood&limit=1&access_token=${TOKEN}`,
      )
      const body = await res.json()
      const first = body?.features?.[0]
      if (first) onAddressSuggested(toGeocodeResult(first).parts, false)
    } catch {
      // Address auto-fill is a convenience — the fields stay editable regardless.
    }
  }, [onAddressSuggested])

  const commit = useCallback((lat: number, lng: number) => {
    onPick(lat, lng)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => resolvePlacement(lat, lng), PLACEMENT_DEBOUNCE_MS)
  }, [onPick, resolvePlacement])

  /* Refs so the map's click and drag handlers always call the current
   * callbacks without the map having to be torn down and rebuilt whenever a
   * parent re-render produces new function identities. */
  const commitRef  = useRef(commit)
  const geocodeRef = useRef(reverseGeocode)
  useEffect(() => { commitRef.current = commit }, [commit])
  useEffect(() => { geocodeRef.current = reverseGeocode }, [reverseGeocode])

  // Changing city invalidates a verdict resolved against the previous one.
  useEffect(() => {
    setPlacement(null)
    onPlacementChange?.(null)
    setQuery("")
    setResults([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId])

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  /*
   * An outlet that already has a pin arrives here with coordinates but no
   * verdict — nothing has been clicked or dragged, and only those paths call
   * resolvePlacement. Without this, the card sat on "Checking what's available
   * here…" forever, because it was waiting on a request that was never made.
   * Resolving once on mount is also just correct: the vendor should see what
   * their existing location supports without having to move the pin to find out.
   */
  const initialResolved = useRef(false)
  useEffect(() => { initialResolved.current = false }, [cityId])
  useEffect(() => {
    if (!coverage || initialResolved.current) return
    if (latitude == null || longitude == null) return
    initialResolved.current = true
    resolvePlacement(latitude, longitude)
  }, [coverage, latitude, longitude, resolvePlacement])

  // ── map lifecycle ──────────────────────────────────────────────────────────

  const hasCoverage = coverage != null

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current || !hasCoverage) return

    mapboxgl.accessToken = TOKEN
    const map = new mapboxgl.Map({
      container         : containerRef.current,
      style             : "mapbox://styles/mapbox/streets-v12",
      center            : [0, 0],
      zoom              : 10,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
    map.addControl(new mapboxgl.AttributionControl({ compact: true }))
    map.on("load", () => setMapLoaded(true))
    map.on("click", (e) => {
      commitRef.current(e.lngLat.lat, e.lngLat.lng)
      geocodeRef.current(e.lngLat.lat, e.lngLat.lng)
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      // The marker belonged to the map that just went away. Leaving the ref set
      // would make the next map take the "already have a marker" branch below
      // and quietly never show a pin at all.
      markerRef.current = null
      setMapLoaded(false)
    }
  }, [hasCoverage])

  // Coverage → sources, layers and framing.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !coverage) return

    const mask: GeoJSON.FeatureCollection = coverage.boundary
      ? { type: "FeatureCollection", features: [maskFeature(coverage.boundary)] }
      : EMPTY_FC

    /** Returns true when the source was newly created, so layers are added once. */
    const sync = (id: string, data: GeoJSON.FeatureCollection) => {
      const existing = map.getSource(id) as mapboxgl.GeoJSONSource | undefined
      if (existing) { existing.setData(data); return false }
      map.addSource(id, { type: "geojson", data })
      return true
    }

    if (sync("coverage-mask", mask)) {
      map.addLayer({
        id: "coverage-mask-fill", type: "fill", source: "coverage-mask",
        paint: { "fill-color": "#0f172a", "fill-opacity": 0.35 },
      })
    }

    if (sync("coverage-zones", zonesToFC(coverage))) {
      map.addLayer({
        id: "coverage-zones-fill", type: "fill", source: "coverage-zones",
        paint: { "fill-color": placementColorExpression(), "fill-opacity": 0.25 },
      })
      map.addLayer({
        id: "coverage-zones-line", type: "line", source: "coverage-zones",
        paint: { "line-color": placementColorExpression(), "line-width": 1.5, "line-opacity": 0.9 },
      })
    }

    // Frame the city — unless the vendor already has a pin, whose own effect
    // below owns the viewport from then on.
    if (latitude != null && longitude != null) return
    if (coverage.boundary) {
      map.fitBounds(boundsOf(coverage.boundary), { padding: 40, duration: 0 })
    } else if (coverage.centroid) {
      map.jumpTo({ center: [coverage.centroid.longitude, coverage.centroid.latitude], zoom: 11 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverage, mapLoaded])

  // The marker follows the committed coordinates, so the form stays the single
  // source of truth for where the pin is — a manual coordinate edit moves it too.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    if (latitude == null || longitude == null || isNaN(latitude) || isNaN(longitude)) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }

    if (!markerRef.current) {
      const marker = new mapboxgl.Marker({ color: "#ef4444", draggable: true })
        .setLngLat([longitude, latitude])
        .addTo(map)
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLngLat()
        commitRef.current(lat, lng)
        geocodeRef.current(lat, lng)
      })
      markerRef.current = marker
      map.easeTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 14) })
    } else {
      markerRef.current.setLngLat([longitude, latitude])
    }
  }, [latitude, longitude, mapLoaded])

  // ── search ─────────────────────────────────────────────────────────────────

  const runSearch = useCallback(async (text: string) => {
    if (!TOKEN || text.trim().length < 3) { setResults([]); return }
    const seq = ++searchSeq.current
    setSearching(true)
    try {
      // Biased toward the city being configured, so "Main Street" resolves to
      // the one here rather than one on another continent.
      const proximity = coverage?.centroid
        ? `&proximity=${coverage.centroid.longitude},${coverage.centroid.latitude}`
        : ""
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json` +
        `?types=address,poi,neighborhood,place&limit=5${proximity}&access_token=${TOKEN}`,
      )
      const body = await res.json()
      if (seq !== searchSeq.current) return
      setResults(((body?.features ?? []) as Record<string, unknown>[]).map(toGeocodeResult))
    } catch {
      if (seq === searchSeq.current) setResults([])
    } finally {
      if (seq === searchSeq.current) setSearching(false)
    }
  }, [coverage])

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 300)
    return () => clearTimeout(t)
  }, [query, runSearch])

  function selectResult(r: GeocodeResult) {
    setResults([])
    setQuery(r.name)
    commit(r.lat, r.lng)
    onAddressSuggested?.(r.parts, true)
  }

  function useMyLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        commit(pos.coords.latitude, pos.coords.longitude)
        reverseGeocode(pos.coords.latitude, pos.coords.longitude)
      },
      () => { /* denied or unavailable — the map and search still work */ },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  // ── render ─────────────────────────────────────────────────────────────────

  if (!cityId) {
    return (
      <EmptyPanel
        icon={MapPin}
        title="Choose a city first"
        body="Pick the city this outlet operates in and we'll show you exactly where we deliver there."
      />
    )
  }

  if (!TOKEN) {
    return (
      <EmptyPanel
        icon={Info}
        title="Map unavailable"
        body="The map isn't configured in this environment. Enter your coordinates manually below — we'll still check them against our coverage when you save."
      />
    )
  }

  if (coverageError) {
    return (
      <EmptyPanel
        icon={Info}
        title="Couldn't load coverage for this city"
        body="Enter your coordinates manually below. We'll check them against our coverage when you save."
      />
    )
  }

  if (!coverage) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--muted)]/30">
        <Loader2 className="size-5 animate-spin text-[var(--muted-foreground)]" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Search + geolocate */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search an address in ${coverage.cityName || cityName || "this city"}`}
              className="pl-9 pr-9"
              aria-label="Search for your outlet address"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(""); setResults([]) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Button type="button" variant="outline" onClick={useMyLocation} className="shrink-0 gap-2">
            <LocateFixed className="size-4" />
            <span className="hidden sm:inline">Use my location</span>
          </Button>
        </div>

        {(searching || results.length > 0) && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-lg">
            {searching && results.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-[var(--muted-foreground)]">
                <Loader2 className="size-3.5 animate-spin" /> Searching…
              </div>
            )}
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => selectResult(r)}
                className="flex w-full cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--muted)]"
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-[var(--muted-foreground)]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-[var(--foreground)]">{r.name}</span>
                  <span className="block truncate text-xs text-[var(--muted-foreground)]">{r.context}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)]">
        <div ref={containerRef} className="h-[420px] w-full" />
        {latitude == null && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 pt-10">
            <p className="text-center text-sm font-medium text-white">
              Tap the map to drop your pin, or search for your address above
            </p>
          </div>
        )}
      </div>

      {/* Legend — only for the coverage kinds this city actually has */}
      {coverage.zones.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
          {PLACEMENT_LEGEND_ORDER
            .filter((s) => coverage.zones.some((z) => z.status === s))
            .map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                <span className="size-2.5 rounded-full" style={{ background: PLACEMENT_META[s].color }} />
                {PLACEMENT_META[s].label}
              </span>
            ))}
        </div>
      )}

      {coverage.boundary == null && (
        <p className="px-1 text-xs text-[var(--muted-foreground)]">
          We haven&apos;t mapped {coverage.cityName} yet, so anywhere in the city works. Drop your pin at your exact
          kitchen — we&apos;ll tell you what&apos;s available as soon as the area goes live.
        </p>
      )}

      <PlacementVerdict placement={placement} resolving={resolving} hasPin={latitude != null} />
    </div>
  )
}

// ─── verdict card ─────────────────────────────────────────────────────────────

const TONE_STYLES: Record<string, string> = {
  positive: "border-emerald-500/30 bg-emerald-500/5",
  neutral : "border-amber-500/30 bg-amber-500/5",
  blocked : "border-red-500/40 bg-red-500/5",
}

function PlacementVerdict({
  placement, resolving, hasPin,
}: { placement: OutletPlacement | null; resolving: boolean; hasPin: boolean }) {
  if (!hasPin) return null

  // Spin only while a request is genuinely in flight. Treating "no verdict" as
  // "still loading" is what let a failed — or never-started — lookup show an
  // endless spinner. With no verdict and nothing running there is simply
  // nothing to say; createOutlet / updateOutlet still check on save.
  if (resolving) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3.5 text-sm text-[var(--muted-foreground)]">
        <Loader2 className="size-4 animate-spin" />
        Checking what&apos;s available here…
      </div>
    )
  }

  if (!placement) return null

  const meta = PLACEMENT_META[placement.status]
  const Icon = meta.icon

  return (
    <div className={`rounded-2xl border px-4 py-3.5 ${TONE_STYLES[meta.tone]}`}>
      <div className="flex items-start gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${meta.color}1f`, color: meta.color }}
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {meta.headline}
            {placement.zoneName && (
              <span className="ml-1.5 font-normal text-[var(--muted-foreground)]">· {placement.zoneName}</span>
            )}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">{meta.detail}</p>

          {placement.canRegister && (
            <ul className="mt-2.5 grid gap-1 sm:grid-cols-2">
              {CAPABILITY_LABELS
                .filter(({ key }) => placement.capabilities[key])
                .map(({ key, label }) => (
                  <li key={key} className="flex items-center gap-1.5 text-xs text-[var(--foreground)]">
                    <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
                    {label}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── shared empty state ───────────────────────────────────────────────────────

function EmptyPanel({
  icon: Icon, title, body,
}: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--muted)]/20 px-8 text-center">
      <Icon className="size-6 text-[var(--muted-foreground)]" />
      <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
      <p className="max-w-sm text-xs leading-relaxed text-[var(--muted-foreground)]">{body}</p>
    </div>
  )
}
