
"use client"

import { useState, useCallback, useTransition, useOptimistic } from "react"
import dynamic from "next/dynamic"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import {
    Plus,
    Pencil,
    Trash2,
    Power,
    PowerOff,
    Loader2, 
    LayoutGrid,
    X,
    Save,
    ChevronDown,
} from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@repo/ui/components/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@repo/ui/components/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu"
import { MapSkeleton } from "@/components/geography/shared/MapLoader"
import { ModeBadge } from "@/components/geography/shared/ModeBadge"
import { GeoStatusBadge } from "@/components/geography/shared/GeoStatusBadge"
import {
  createServiceAreaSchema,
  type CreateServiceAreaFormValues,
} from "@/lib/zod/geography"
import {
  createServiceArea,
  updateServiceArea,
  deleteServiceArea,
  activateServiceArea,
  deactivateServiceArea,
} from "@/lib/api/geography"
import type {
    ServiceArea,
    ServiceAreaMode,
    ServiceAreaBoundary,
    CityBoundary,
} from "@repo/types/admin-app"
import { SERVICE_AREA_MODE_CONFIG } from "@/types/geography.types"

const ServiceAreaMapInner = dynamic(
  () => import("./ServiceAreaMapInner"),
  { ssr: false, loading: () => <MapSkeleton height="h-full" /> },
)

interface Props {
  cityId      : string
  cityBoundary: CityBoundary | null
  initial     : ServiceArea[]
}

const inputCls =
  "bg-background border-border text-foreground " +
  "placeholder:text-muted-foreground focus-visible:ring-primary"

function InlineError({ errors, touched }: { errors: unknown[]; touched: boolean }) {
  if (!touched || !errors.length) return null
  return <p className="mt-1 text-xs text-destructive">{String(errors[0])}</p>
}

type PanelMode = "idle" | "drawing" | "editing"

export function ServiceAreaPageClient({ cityId, cityBoundary, initial }: Props) {
  const [areas, setAreas] = useOptimistic(initial, (_, next: ServiceArea[]) => next)
  const [serverAreas, setServerAreas] = useState<ServiceArea[]>(initial)
  const [panelMode, setPanelMode] = useState<PanelMode>("idle")
  const [selectedMode, setSelectedMode] = useState<ServiceAreaMode>("FULL_SERVICE")
  const [editingArea, setEditingArea] = useState<ServiceArea | null>(null)
  const [pendingBoundary, setPendingBoundary] = useState<ServiceAreaBoundary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ServiceArea | null>(null)
  const [isPending, startTransition] = useTransition()

  //* Form
  const form = useForm({
    defaultValues: { name: "", mode: "FULL_SERVICE" as ServiceAreaMode },
    onSubmit: async ({ value }) => {
      const parsed = createServiceAreaSchema.safeParse(value)
      if (!parsed.success) return

      if (!pendingBoundary) {
        toast.error("No polygon drawn", { description: "Draw a polygon on the map first." })
        return
      }

      startTransition(async () => {
        try {
          if (panelMode === "drawing") {
            const created = await createServiceArea(cityId, {
              name    : parsed.data.name,
              mode    : parsed.data.mode as ServiceAreaMode,
              boundary: pendingBoundary,
            })
            const next = [...serverAreas, created]
            setServerAreas(next)
            setAreas(next)
            toast.success("Service area created", { description: created.name })
          } else if (panelMode === "editing" && editingArea) {
            const updated = await updateServiceArea(editingArea.id, {
              name    : parsed.data.name,
              mode    : parsed.data.mode as ServiceAreaMode,
              boundary: pendingBoundary,
            })
            const next = serverAreas.map((a) => (a.id === updated.id ? updated : a))
            setServerAreas(next)
            setAreas(next)
            toast.success("Service area updated")
          }

          resetPanel()
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Operation failed"
          toast.error("Error", { description: message })
        }
      })
    },
  })

  const resetPanel = useCallback(() => {
    setPanelMode("idle")
    setEditingArea(null)
    setPendingBoundary(null)
    form.reset()
  }, [form])

  const startDrawing = useCallback(() => {
    resetPanel()
    setPanelMode("drawing")
    form.setFieldValue("mode", selectedMode)
  }, [resetPanel, form, selectedMode])

  const startEditing = useCallback((area: ServiceArea) => {
    setEditingArea(area)
    setPanelMode("editing")
    setPendingBoundary(area.boundaries)
    form.setFieldValue("name", area.name)
    form.setFieldValue("mode", area.mode)
  }, [form])

  const handleToggleStatus = useCallback((area: ServiceArea) => {
    startTransition(async () => {
      try {
        if (area.status === "ACTIVE") {
          const res = await deactivateServiceArea(area.id)
          const next = serverAreas.map((a) =>
            a.id === area.id ? { ...a, status: "INACTIVE" as const } : a
          )
          setServerAreas(next)
          setAreas(next)
          toast.success("Service area deactivated", {
            description: res.linkedOutlets > 0
              ? `${res.linkedOutlets} linked outlet(s) may be affected.`
              : undefined,
          })
        } else {
          await activateServiceArea(area.id)
          const next = serverAreas.map((a) =>
            a.id === area.id ? { ...a, status: "ACTIVE" as const } : a
          )
          setServerAreas(next)
          setAreas(next)
          toast.success("Service area activated")
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed"
        toast.error("Error", { description: message })
      }
    })
  }, [serverAreas, setAreas])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    startTransition(async () => {
      try {
        await deleteServiceArea(deleteTarget.id)
        const next = serverAreas.filter((a) => a.id !== deleteTarget.id)
        setServerAreas(next)
        setAreas(next)
        setDeleteTarget(null)
        toast.success("Service area deleted")
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to delete"
        toast.error("Error", { description: message })
      }
    })
  }, [deleteTarget, serverAreas, setAreas])

  return (
    <div className="flex flex-col h-full gap-4" style={{ height: "calc(100vh - 220px)" }}>
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Left sidebar */}
        <div className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">

          {/* Mode legend */}
          <div className="admin-card space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Service Modes
            </p>
            {(Object.entries(SERVICE_AREA_MODE_CONFIG) as [ServiceAreaMode, typeof SERVICE_AREA_MODE_CONFIG[ServiceAreaMode]][]).map(([mode, cfg]) => (
              <div key={mode} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 size-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                <div>
                  <p className="font-medium text-foreground">{cfg.label}</p>
                  <p className="text-muted-foreground">{cfg.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Draw new area */}
          {panelMode === "idle" && (
            <div className="admin-card space-y-3">
              <p className="text-sm font-semibold">Draw new area</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Service mode</Label>
                <Select
                  value={selectedMode}
                  onValueChange={(v) => setSelectedMode(v as ServiceAreaMode)}
                >
                  <SelectTrigger className={`h-8 text-xs ${inputCls}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {Object.entries(SERVICE_AREA_MODE_CONFIG).map(([mode, cfg]) => (
                      <SelectItem key={mode} value={mode} className="text-xs">
                        <span className="flex items-center gap-2">
                          <span className="size-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                          {cfg.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" className="w-full gap-2" onClick={startDrawing}>
                <Plus className="size-3.5" />
                Draw on map
              </Button>
            </div>
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
                  {panelMode === "drawing" ? "New service area" : "Edit area"}
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
                    const r = createServiceAreaSchema.shape.name.safeParse(value)
                    return r.success ? undefined : r.error.issues[0]?.message
                  },
                }}
              >
                {(field) => (
                  <div className="space-y-1">
                    <Label htmlFor="sa-name" className="text-xs">
                      Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="sa-name"
                      className={`h-8 text-xs ${inputCls}`}
                      placeholder="e.g. Westlands Core"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                    <InlineError errors={field.state.meta.errors} touched={field.state.meta.isTouched} />
                  </div>
                )}
              </form.Field>

              <form.Field name="mode">
                {(field) => (
                  <div className="space-y-1">
                    <Label className="text-xs">Mode</Label>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger className={`h-8 text-xs ${inputCls}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {Object.entries(SERVICE_AREA_MODE_CONFIG).map(([mode, cfg]) => (
                          <SelectItem key={mode} value={mode} className="text-xs">
                            <span className="flex items-center gap-2">
                              <span className="size-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                              {cfg.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>

              {!pendingBoundary && (
                <p className="text-xs text-[var(--color-warning)] flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-[var(--color-warning)]" />
                  Draw a polygon on the map
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
                      : <><Save className="size-3.5" />Save area</>
                    }
                  </Button>
                )}
              </form.Subscribe>
            </form>
          )}

          {/* Service areas list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
              {areas.length} area{areas.length !== 1 ? "s" : ""}
            </p>
            {areas.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 p-4 text-center">
                <LayoutGrid className="size-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No service areas yet</p>
              </div>
            )}
            {areas.map((area) => (
              <div
                key={area.id}
                className={`admin-card p-3 cursor-pointer transition-all
                  ${editingArea?.id === area.id
                    ? "border-primary/60 bg-primary/5"
                    : "hover:border-border hover:bg-muted/40"
                  }`}
                onClick={() => startEditing(area)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{area.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <ModeBadge mode={area.mode} />
                      <GeoStatusBadge status={area.status} />
                    </div>
                    {area._count && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {area._count.outlets} outlet{area._count.outlets !== 1 ? "s" : ""}
                      </p>
                    )}
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
                        onClick={(e) => { e.stopPropagation(); startEditing(area) }}
                      >
                        <Pencil className="size-3.5" />Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-xs gap-2"
                        onClick={(e) => { e.stopPropagation(); handleToggleStatus(area) }}
                      >
                        {area.status === "ACTIVE"
                          ? <><PowerOff className="size-3.5" />Deactivate</>
                          : <><Power className="size-3.5" />Activate</>
                        }
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-xs gap-2 text-destructive focus:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(area) }}
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

        {/* Map */}
        <div className="flex-1 min-w-0 rounded-xl overflow-hidden border border-border/60">
          <ServiceAreaMapInner
            cityBoundary    ={cityBoundary}
            serviceAreas    ={areas}
            activeMode      ={selectedMode}
            editingId       ={editingArea?.id ?? null}
            onPolygonDrawn  ={(boundary) => setPendingBoundary(boundary)}
            onPolygonUpdated={(_, boundary) => setPendingBoundary(boundary)}
            onPolygonDeleted={() => setPendingBoundary(null)}
          />
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
            <DialogDescription>
              This permanently removes the service area and cannot be undone.
              Outlets currently in this area will need to be reassigned.
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