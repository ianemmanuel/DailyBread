
"use client"

import { useState, useCallback, useTransition } from "react"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import {
  Search, 
  Save,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Globe,
  Pencil,
} from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Badge } from "@repo/ui/components/badge"
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from "@repo/ui/components/alert"
import {
    Dialog, 
    DialogContent,
    DialogDescription,
    DialogFooter, 
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@repo/ui/components/dialog"
import { MapSkeleton }     from "@/components/geography/shared/MapLoader"
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard"
import {
  previewOsmBoundary,
  saveCityBoundary,
  clearCityBoundary,
} from "@/lib/api/geography"
import type { 
    CityBoundaryData,
    CityBoundary,
    OsmPreviewResult
} from "@repo/types/admin-app"

// Dynamically import the heavy Mapbox component — never SSR
const BoundaryMapInner = dynamic(
  () => import("./BoundaryMapInner"),
  { ssr: false, loading: () => <MapSkeleton height="h-full" /> },
)

interface Props {
  cityId     : string
  countryCode: string
  initial    : CityBoundaryData
}

export function BoundaryPageClient({ cityId, countryCode, initial }: Props) {
  //* State
  const [currentBoundary, setCurrentBoundary] = useState<CityBoundary | null>(
    initial.boundary,
  )
  const [drawnBoundary, setDrawnBoundary] = useState<CityBoundary | null>(
    initial.boundary,
  )
  const [osmPreview, setOsmPreview] = useState<OsmPreviewResult | null>(null)
  const [osmQuery, setOsmQuery] = useState(initial.cityName)
  const [boundarySource, setBoundarySource] = useState<"OSM" | "MANUAL" | null>(
    initial.boundarySource,
  )
  const [osmId, setOsmId] = useState<string | null>(initial.osmId)

  const isDirty = drawnBoundary !== currentBoundary

  const [isSearching, startSearch] = useTransition()
  const [isSaving, startSave] = useTransition()
  const [isClearing, startClear] = useTransition()

  useUnsavedGuard(isDirty)

  //* OSM search
  const handleOsmSearch = useCallback(() => {
    if (!osmQuery.trim()) return
    startSearch(async () => {
      try {
        const result = await previewOsmBoundary(cityId, osmQuery.trim(), countryCode)
        if (!result) {
          toast.warning("No result found", {
            description:
              "OpenStreetMap didn't return a polygon for this city. " +
              "Try a different search term or draw manually.",
          })
          return
        }
        setOsmPreview(result)
        setDrawnBoundary(result.boundary)
        setBoundarySource("OSM")
        setOsmId(result.osmId)
        toast.info("Boundary loaded from OpenStreetMap", {
          description: `"${result.displayName}" — review and edit before saving.`,
          duration   : 6000,
        })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Search failed"
        toast.error("OSM search failed", { description: message })
      }
    })
  }, [cityId, countryCode, osmQuery])

  //* Save boundary
  const handleSave = useCallback(() => {
    if (!drawnBoundary) {
      toast.error("No boundary drawn", {
        description: "Draw a polygon using the map tool before saving.",
      })
      return
    }
    startSave(async () => {
      try {
        await saveCityBoundary(cityId, {
          boundary: drawnBoundary,
          source  : boundarySource ?? "MANUAL",
          osmId   : osmId ?? undefined,
        })
        setCurrentBoundary(drawnBoundary)
        setBoundarySource(boundarySource ?? "MANUAL")
        toast.success("City boundary saved", {
          description: "The boundary has been saved and coordinates derived.",
        })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Save failed"
        toast.error("Failed to save boundary", { description: message })
      }
    })
  }, [cityId, drawnBoundary, boundarySource, osmId])

  //* Clear boundary
  const handleClear = useCallback(() => {
    startClear(async () => {
      try {
        await clearCityBoundary(cityId)
        setCurrentBoundary(null)
        setDrawnBoundary(null)
        setOsmPreview(null)
        setBoundarySource(null)
        setOsmId(null)
        toast.success("Boundary cleared")
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Clear failed"
        toast.error("Failed to clear boundary", { description: message })
      }
    })
  }, [cityId])

  //* Map boundary change
  const handleBoundaryChange = useCallback((boundary: CityBoundary | null) => {
    setDrawnBoundary(boundary)
    if (boundary && !osmPreview) {
      setBoundarySource("MANUAL")
      setOsmId(null)
    }
  }, [osmPreview])

  //* Render
  const hasSaved = currentBoundary != null

  return (
    <div className="flex flex-col h-full gap-4">

      {/* Unsaved warning */}
      {isDirty && (
        <Alert className="border-[var(--color-warning)] bg-[var(--color-warning-muted)] animate-slide-up">
          <AlertTriangle className="size-4 text-[var(--color-warning)]" />
          <AlertTitle className="text-[var(--color-warning)]">Unsaved changes</AlertTitle>
          <AlertDescription>
            You have unsaved boundary changes. Save before navigating away.
          </AlertDescription>
        </Alert>
      )}

      {/* Status bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {hasSaved ? (
          <span className="flex items-center gap-1.5 text-sm text-[var(--color-success)]">
            <CheckCircle2 className="size-4" />
            Boundary saved
            {initial.boundarySource && (
              <Badge variant="outline" className="ml-1 text-xs">
                {initial.boundarySource === "OSM" ? "from OpenStreetMap" : "manually drawn"}
              </Badge>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Info className="size-4" />
            No boundary set — search OSM or draw manually below
          </span>
        )}
      </div>

      {/* Two-column layout: sidebar + map */}
      <div className="flex gap-4 flex-1 min-h-0" style={{ height: "calc(100vh - 280px)" }}>

        {/* ── Left sidebar ─────────────────────────────────────────────────── */}
        <div className="w-72 shrink-0 flex flex-col gap-4">

          {/* OSM Search */}
          <div className="admin-card space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="size-4 text-primary" />
              <p className="text-sm font-semibold">Search OpenStreetMap</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Search for the city boundary from OpenStreetMap. The result will
              load on the map for you to review and edit.
            </p>
            <div className="space-y-2">
              <Label htmlFor="osm-query" className="text-xs">City name</Label>
              <Input
                id="osm-query"
                value={osmQuery}
                onChange={(e) => setOsmQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleOsmSearch()}
                placeholder="e.g. Nairobi"
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-2"
                onClick={handleOsmSearch}
                disabled={isSearching || !osmQuery.trim()}
              >
                {isSearching
                  ? <><Loader2 className="size-3.5 animate-spin" />Searching…</>
                  : <><Search className="size-3.5" />Search OSM</>
                }
              </Button>
            </div>

            {osmPreview && (
              <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs space-y-1">
                <p className="font-medium text-foreground truncate">{osmPreview.displayName}</p>
                <p className="text-muted-foreground">OSM ID: {osmPreview.osmId}</p>
                <p className="text-muted-foreground italic">
                  Loaded on map — edit vertices if needed, then save.
                </p>
              </div>
            )}
          </div>

          {/* Manual draw hint */}
          <div className="admin-card space-y-2">
            <div className="flex items-center gap-2">
              <Pencil className="size-4 text-primary" />
              <p className="text-sm font-semibold">Draw manually</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Use the polygon tool in the top-left of the map to draw the city boundary
              by clicking points. Click the first point again to close the polygon.
            </p>
          </div>

          {/* Actions */}
          <div className="mt-auto flex flex-col gap-2">
            <Button
              className="w-full gap-2"
              onClick={handleSave}
              disabled={isSaving || !drawnBoundary || !isDirty}
            >
              {isSaving
                ? <><Loader2 className="size-4 animate-spin" />Saving…</>
                : <><Save className="size-4" />Save boundary</>
              }
            </Button>

            {hasSaved && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 text-destructive hover:text-destructive"
                    disabled={isClearing}
                  >
                    {isClearing
                      ? <><Loader2 className="size-3.5 animate-spin" />Clearing…</>
                      : <><Trash2 className="size-3.5" />Clear boundary</>
                    }
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-2xl">
                  <DialogHeader>
                    <DialogTitle>Clear city boundary?</DialogTitle>
                    <DialogDescription>
                      This removes the stored boundary and derived coordinates.
                      All service areas must be deleted first.
                      This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline">Cancel</Button>
                    <Button variant="destructive" onClick={handleClear}>
                      Yes, clear boundary
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 min-w-0 rounded-xl overflow-hidden border border-border/60">
          <BoundaryMapInner
            initialBoundary ={drawnBoundary}
            centroid        ={
              initial.centroid.latitude != null && initial.centroid.longitude != null
                ? { latitude: initial.centroid.latitude, longitude: initial.centroid.longitude }
                : null
            }
            onBoundaryChange={handleBoundaryChange}
          />
        </div>
      </div>
    </div>
  )
}