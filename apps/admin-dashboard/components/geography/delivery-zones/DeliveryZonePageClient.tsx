// components/geography/delivery-zones/DeliveryZonePageClient.tsx
"use client"

import { useState, useCallback, useTransition } from "react"
import dynamic                                  from "next/dynamic"
import { useForm }                              from "@tanstack/react-form"
import { toast }                                from "sonner"
import {
  Plus, Pencil, Trash2, Power, PowerOff,
  Loader2, Map, X, Save, ChevronDown,
  AlertTriangle,
} from "lucide-react"
import { Button }   from "@repo/ui/components/button"
import { Input }    from "@repo/ui/components/input"
import { Label }    from "@repo/ui/components/label"
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@repo/ui/components/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu"
import { MapSkeleton }    from "@/components/geography/shared/MapLoader"
import { GeoStatusBadge } from "@/components/geography/shared/GeoStatusBadge"
import {
  createDeliveryZoneSchema,
} from "@/lib/zod/geography"
import {
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
  activateDeliveryZone,
  deactivateDeliveryZone,
} from "@/lib/api/geography"
import type {
  DeliveryZone, ServiceArea, CityBoundary, DeliveryZoneBoundary,
} from "@repo/types/geography"

const DeliveryZoneMapInner = dynamic(
  () => import("./DeliveryZoneMapInner"),
  { ssr: false, loading: () => <MapSkeleton height="h-full" /> },
)

interface Props {
  cityId          : string
  cityBoundary    : CityBoundary | null
  fullServiceAreas: ServiceArea[]
  initial         : DeliveryZone[]
}

const inputCls =
  "bg-background border-border text-foreground " +
  "placeholder:text-muted-foreground focus-visible:ring-primary"

function InlineError({ errors, touched }: { errors: unknown[]; touched: boolean }) {
  if (!touched || !errors.length) return null
  return <p className="mt-1 text-xs text-destructive">{String(errors[0])}</p>
}

type PanelMode = "idle" | "drawing" | "editing"

export function DeliveryZonePageClient({
  cityId,
  cityBoundary,
  fullServiceAreas,
  initial,
}: Props) {
  const [zones, setZones]                     = useState<DeliveryZone[]>(initial)
  const [panelMode, setPanelMode]             = useState<PanelMode>("idle")
  const [editingZone, setEditingZone]         = useState<DeliveryZone | null>(null)
  const [pendingBoundary, setPendingBoundary] = useState<DeliveryZoneBoundary | null>(null)
  const [deleteTarget, setDeleteTarget]       = useState<DeliveryZone | null>(null)
  const [isPending, startTransition]          = useTransition()

  const form = useForm({
    defaultValues: { name: "", maxCourierCount: "" as unknown as number | undefined },
    onSubmit: async ({ value }) => {
      const parsed = createDeliveryZoneSchema.safeParse({
        name           : value.name,
        maxCourierCount: value.maxCourierCount || undefined,
      })
      if (!parsed.success) return

      if (!pendingBoundary) {
        toast.error("No polygon drawn", { description: "Draw the zone boundary on the map first." })
        return
      }

      startTransition(async () => {
        try {
          if (panelMode === "drawing") {
            const result = await createDeliveryZone(cityId, {
              name           : parsed.data.name,
              boundary       : pendingBoundary,
              maxCourierCount: parsed.data.maxCourierCount,
            })

            if (result.overlapWarning) {
              toast.warning("Overlap detected", {
                description: result.overlapWarning,
                duration   : 8000,
              })
            }

            setZones((prev) => [...prev, result.zone])
            toast.success("Delivery zone created")
          } else if (panelMode === "editing" && editingZone) {
            const result = await updateDeliveryZone(editingZone.id, {
              name           : parsed.data.name,
              boundary       : pendingBoundary,
              maxCourierCount: parsed.data.maxCourierCount,
            })

            if (result.overlapWarning) {
              toast.warning("Overlap detected", {
                description: result.overlapWarning,
                duration   : 8000,
              })
            }

            setZones((prev) =>
              prev.map((z) => (z.id === result.zone.id ? result.zone : z))
            )
            toast.success("Delivery zone updated")
          }

          resetPanel()
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Operation failed"
          // Surface containment errors prominently — they're actionable
          toast.error(
            message.includes("FULL_SERVICE") ? "Zone outside Full Service area" : "Error",
            { description: message, duration: 8000 },
          )
        }
      })
    },
  })

  const resetPanel = useCallback(() => {
    setPanelMode("idle")
    setEditingZone(null)
    setPendingBoundary(null)
    form.reset()
  }, [form])

  const startEditing = useCallback((zone: DeliveryZone) => {
    setEditingZone(zone)
    setPanelMode("editing")
    setPendingBoundary(zone.boundaries)
    form.setFieldValue("name", zone.name)
    form.setFieldValue("maxCourierCount", zone.maxCourierCount ?? ("" as unknown as number))
  }, [form])

  const handleToggleStatus = useCallback((zone: DeliveryZone) => {
    startTransition(async () => {
      try {
        if (zone.status === "ACTIVE") {
          await deactivateDeliveryZone(zone.id)
          setZones((prev) =>
            prev.map((z) => (z.id === zone.id ? { ...z, status: "INACTIVE" as const } : z))
          )
          toast.success("Delivery zone deactivated")
        } else {
          await activateDeliveryZone(zone.id)
          setZones((prev) =>
            prev.map((z) => (z.id === zone.id ? { ...z, status: "ACTIVE" as const } : z))
          )
          toast.success("Delivery zone activated")
        }
      } catch (err: unknown) {
        toast.error("Error", {
          description: err instanceof Error ? err.message : "Failed",
        })
      }
    })
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    startTransition(async () => {
      try {
        await deleteDeliveryZone(deleteTarget.id)
        setZones((prev) => prev.filter((z) => z.id !== deleteTarget.id))
        setDeleteTarget(null)
        toast.success("Delivery zone deleted")
      } catch (err: unknown) {
        toast.error("Error", {
          description: err instanceof Error ? err.message : "Failed to delete",
        })
      }
    })
  }, [deleteTarget])

  return (
    <div className="flex gap-4 flex-1 min-h-0" style={{ height: "calc(100vh - 240px)" }}>

      {/* ── Left sidebar ───────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">

        {/* Info */}
        <div className="admin-card space-y-2">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-[#6366f1]" />
            <p className="text-sm font-semibold">Delivery Zones</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Zones must be fully inside a{" "}
            <span className="font-medium text-[#22c55e]">Full Service</span> area.
            The backend enforces this — the map shows reference polygons to guide you.
          </p>
          {fullServiceAreas.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-[var(--color-warning-muted)]
                            px-3 py-2 text-xs text-[var(--color-warning)]">
              <AlertTriangle className="size-3.5 shrink-0" />
              No Full Service areas exist yet. Create one first.
            </div>
          )}
        </div>

        {/* Draw new / idle panel */}
        {panelMode === "idle" && (
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={() => setPanelMode("drawing")}
            disabled={fullServiceAreas.length === 0}
          >
            <Plus className="size-3.5" />
            Draw new zone
          </Button>
        )}

        {/* Active draw/edit panel */}
        {panelMode !== "idle" && (
          <form
            onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}
            className="admin-card space-y-3"
            noValidate
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                {panelMode === "drawing" ? "New delivery zone" : "Edit zone"}
              </p>
              <button
                type="button"
                onClick={resetPanel}
                className="rounded p-1 hover:bg-muted transition-colors"
              >
                <X className="size-3.5 text-muted-foreground" />
              </button>
            </div>

            <form.Field
              name="name"
              validators={{
                onBlur: ({ value }) => {
                  const r = createDeliveryZoneSchema.shape.name.safeParse(value)
                  return r.success ? undefined : r.error.issues[0]?.message
                },
              }}
            >
              {(f) => (
                <div className="space-y-1">
                  <Label htmlFor="dz-name" className="text-xs">
                    Zone name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="dz-name" className={`h-8 text-xs ${inputCls}`}
                    placeholder="e.g. Westlands North"
                    value={f.state.value}
                    onChange={(e) => f.handleChange(e.target.value)}
                    onBlur={f.handleBlur}
                  />
                  <InlineError errors={f.state.meta.errors} touched={f.state.meta.isTouched} />
                </div>
              )}
            </form.Field>

            <form.Field
              name="maxCourierCount"
              validators={{
                onBlur: ({ value }) => {
                  if (!value) return undefined
                  const r = createDeliveryZoneSchema.shape.maxCourierCount.safeParse(Number(value))
                  return r.success ? undefined : r.error.issues[0]?.message
                },
              }}
            >
              {(f) => (
                <div className="space-y-1">
                  <Label htmlFor="dz-couriers" className="text-xs">
                    Max couriers{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="dz-couriers" type="number" min={1} step={1}
                    className={`h-8 text-xs ${inputCls}`}
                    placeholder="e.g. 5"
                    value={f.state.value ?? ""}
                    onChange={(e) =>
                      f.handleChange(
                        e.target.value === ""
                          ? (undefined as unknown as number)
                          : Number(e.target.value),
                      )
                    }
                    onBlur={f.handleBlur}
                  />
                  <InlineError errors={f.state.meta.errors} touched={f.state.meta.isTouched} />
                </div>
              )}
            </form.Field>

            {!pendingBoundary && (
              <p className="text-xs text-[var(--color-warning)] flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[var(--color-warning)]" />
                Draw the zone polygon on the map
              </p>
            )}
            {pendingBoundary && (
              <p className="text-xs text-[var(--color-success)] flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[var(--color-success)]" />
                Polygon drawn — name it and save
              </p>
            )}

            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  size="sm"
                  className="w-full gap-2"
                  disabled={isSubmitting || isPending || !pendingBoundary}
                >
                  {isSubmitting || isPending
                    ? <><Loader2 className="size-3.5 animate-spin" />Saving…</>
                    : <><Save className="size-3.5" />Save zone</>
                  }
                </Button>
              )}
            </form.Subscribe>
          </form>
        )}

        {/* Zone list */}
        <div className="flex-1 space-y-2 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            {zones.length} zone{zones.length !== 1 ? "s" : ""}
          </p>
          {zones.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 p-4 text-center">
              <Map className="size-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No delivery zones yet</p>
            </div>
          )}
          {zones.map((zone) => (
            <div
              key={zone.id}
              className={`admin-card p-3 cursor-pointer transition-all
                ${editingZone?.id === zone.id
                  ? "border-primary/60 bg-primary/5"
                  : "hover:border-border hover:bg-muted/40"
                }`}
              onClick={() => startEditing(zone)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{zone.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <GeoStatusBadge status={zone.status} />
                    {zone.maxCourierCount && (
                      <span className="text-[11px] text-muted-foreground">
                        max {zone.maxCourierCount} couriers
                      </span>
                    )}
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="rounded p-1 hover:bg-muted transition-colors shrink-0"
                    >
                      <ChevronDown className="size-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl w-40">
                    <DropdownMenuItem
                      className="text-xs gap-2"
                      onClick={(e) => { e.stopPropagation(); startEditing(zone) }}
                    >
                      <Pencil className="size-3.5" />Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-xs gap-2"
                      onClick={(e) => { e.stopPropagation(); handleToggleStatus(zone) }}
                    >
                      {zone.status === "ACTIVE"
                        ? <><PowerOff className="size-3.5" />Deactivate</>
                        : <><Power className="size-3.5" />Activate</>
                      }
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-xs gap-2 text-destructive focus:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(zone) }}
                    >
                      <Trash2 className="size-3.5" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Map ──────────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 rounded-xl overflow-hidden border border-border/60">
        <DeliveryZoneMapInner
          cityBoundary    ={cityBoundary}
          fullServiceAreas={fullServiceAreas}
          deliveryZones   ={zones}
          editingZoneId   ={editingZone?.id ?? null}
          onPolygonDrawn  ={(boundary) => setPendingBoundary(boundary)}
          onPolygonUpdated={(_, boundary) => setPendingBoundary(boundary)}
          onPolygonDeleted={() => setPendingBoundary(null)}
        />
      </div>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
            <DialogDescription>
              This permanently removes the delivery zone. Active courier assignments
              referencing this zone must be updated separately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}