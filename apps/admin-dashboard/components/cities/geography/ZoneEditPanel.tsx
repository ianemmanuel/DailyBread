"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Loader2, Pencil, ArrowUpDown, Pause, Play, Power, Trash2, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import type { Zone, ZoneLevel, ZoneOperationalStatus } from "@repo/types/admin-app"
import { ZONE_LEVEL_META, ZONE_LEVEL_ORDER, ZONE_STATUS_META } from "./zone-meta"

const OPERATIONAL_STATUSES: ZoneOperationalStatus[] = ["ACTIVE", "SUSPENDED", "MAINTENANCE", "EMERGENCY"]

interface Props {
  zone         : Zone
  citySlug     : string
  canWriteZones: boolean
  canSetLevel  : boolean
  /** Reshaping needs the map — desktop only. */
  canEditShape : boolean
  onEditShape  : () => void
  onClose      : () => void
}

type Dialog = null | "level" | "status" | "deactivate" | "activate" | "delete"

export function ZoneEditPanel({ zone, citySlug, canWriteZones, canSetLevel, canEditShape, onEditShape, onClose }: Props) {
  const router = useRouter()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [pending, setPending] = useState(false)

  const [level, setLevel] = useState<ZoneLevel>(zone.level)
  const [levelReason, setLevelReason] = useState("")
  const [status, setStatus] = useState<ZoneOperationalStatus>(
    zone.operationalStatus === "ACTIVE" ? "SUSPENDED" : zone.operationalStatus,
  )
  const [statusReason, setStatusReason] = useState("")
  const [pausedUntil, setPausedUntil] = useState("")

  const q = `?cityRef=${citySlug}`

  async function send(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown, okMsg?: string) {
    setPending(true)
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error("Action failed", { description: data?.message ?? "Please try again." })
        return false
      }
      if (okMsg) toast.success(okMsg)
      setDialog(null)
      router.refresh()
      return true
    } catch {
      toast.error("Network error", { description: "Please try again." })
      return false
    } finally {
      setPending(false)
    }
  }

  const isRetired = zone.status === "INACTIVE"
  const statusMeta = ZONE_STATUS_META[zone.operationalStatus]

  return (
    <div className="admin-card space-y-3 border-primary/30">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: ZONE_LEVEL_META[zone.level].color }} />
            <span className="truncate">{zone.name}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{ZONE_LEVEL_META[zone.level].label}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={zone.operationalStatus === "ACTIVE" ? "badge-success" : statusMeta.badgeCls}>
          {statusMeta.label}
        </span>
        {isRetired && <span className="badge-neutral">Retired</span>}
        {zone._count && (
          <span className="badge-neutral">{zone._count.outlets} outlet{zone._count.outlets === 1 ? "" : "s"}</span>
        )}
      </div>

      {zone.operationalStatus !== "ACTIVE" && zone.operationalStatusReason && (
        <p className="rounded-lg bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
          {zone.operationalStatusReason}
        </p>
      )}

      {!canWriteZones && (
        <p className="text-xs text-muted-foreground">Read-only — zone changes need <code>settings:zones:write</code>.</p>
      )}

      {canWriteZones && !isRetired && (
        <div className="flex flex-wrap gap-1.5">
          {canEditShape && (
            <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" onClick={onEditShape}>
              <Pencil className="h-3.5 w-3.5" /> Edit shape
            </Button>
          )}
          <Button
            type="button" variant="outline" size="sm" className="rounded-full gap-1.5"
            disabled={!canSetLevel}
            onClick={() => { setLevel(zone.level); setLevelReason(""); setDialog("level") }}
          >
            <ArrowUpDown className="h-3.5 w-3.5" /> Level
          </Button>
          {zone.operationalStatus === "ACTIVE" ? (
            <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5"
              onClick={() => { setStatus("SUSPENDED"); setStatusReason(""); setPausedUntil(""); setDialog("status") }}>
              <Pause className="h-3.5 w-3.5" /> Pause
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5"
              onClick={() => void send(`/api/zones/${zone.id}/operational-status${q}`, "POST", { operationalStatus: "ACTIVE" }, "Zone resumed")}>
              <Play className="h-3.5 w-3.5" /> Resume
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" className="rounded-full gap-1.5 text-muted-foreground"
            onClick={() => setDialog("deactivate")}>
            <Power className="h-3.5 w-3.5" /> Retire
          </Button>
        </div>
      )}

      {canWriteZones && isRetired && (
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5"
            onClick={() => void send(`/api/zones/${zone.id}/activate${q}`, "POST", {}, "Zone reactivated")}>
            <Power className="h-3.5 w-3.5" /> Reactivate
          </Button>
          <Button type="button" variant="ghost" size="sm" className="rounded-full gap-1.5 text-destructive hover:bg-destructive-bg"
            onClick={() => setDialog("delete")}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      )}

      {/* Level dialog */}
      <AlertDialog open={dialog === "level"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-primary h-11 w-11"><ArrowUpDown className="h-5 w-5" /></div>
            <AlertDialogTitle>Change capability level</AlertDialogTitle>
            <AlertDialogDescription>
              This is the strategic decision — what {zone.name} is allowed to do. It doesn&apos;t
              change whether the zone is running.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Level</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as ZoneLevel)}>
                <SelectTrigger className="rounded-xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ZONE_LEVEL_ORDER.map((lv) => (
                    <SelectItem key={lv} value={lv}>{ZONE_LEVEL_META[lv].short} · {ZONE_LEVEL_META[lv].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ZONE_LEVEL_META[level].description}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="zone-level-reason">Reason *</Label>
              <Textarea id="zone-level-reason" value={levelReason} onChange={(e) => setLevelReason(e.target.value)}
                placeholder="e.g. Order density and outlet count now support platform delivery"
                className="min-h-16 text-sm" />
            </div>
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialog(null)} disabled={pending}>Cancel</Button>
            <Button type="button" className="rounded-full gap-1.5"
              disabled={pending || level === zone.level || !levelReason.trim()}
              onClick={() => void send(`/api/zones/${zone.id}/level${q}`, "POST", { level, reason: levelReason.trim() }, "Zone level updated")}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} Apply
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Operational status dialog */}
      <AlertDialog open={dialog === "status"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-warning h-11 w-11"><Pause className="h-5 w-5" /></div>
            <AlertDialogTitle>Pause {zone.name}</AlertDialogTitle>
            <AlertDialogDescription>
              New orders and meal-plan deliveries stop. Outlets stay registered and the
              capability level is preserved — resume to restore it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ZoneOperationalStatus)}>
                <SelectTrigger className="rounded-xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPERATIONAL_STATUSES.filter((s) => s !== "ACTIVE").map((s) => (
                    <SelectItem key={s} value={s}>{ZONE_STATUS_META[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="zone-status-reason">Reason *</Label>
              <Textarea id="zone-status-reason" value={statusReason} onChange={(e) => setStatusReason(e.target.value)}
                placeholder="e.g. Flooding in this area — deliveries unsafe" className="min-h-16 text-sm" />
            </div>
            {status === "MAINTENANCE" && (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="zone-paused-until">Planned resume (optional)</Label>
                <Input id="zone-paused-until" type="datetime-local" value={pausedUntil}
                  onChange={(e) => setPausedUntil(e.target.value)} className="rounded-xl text-sm" />
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialog(null)} disabled={pending}>Cancel</Button>
            <Button type="button" variant="destructive" className="rounded-full gap-1.5"
              disabled={pending || !statusReason.trim()}
              onClick={() => void send(`/api/zones/${zone.id}/operational-status${q}`, "POST", {
                operationalStatus: status,
                reason: statusReason.trim(),
                ...(status === "MAINTENANCE" && pausedUntil ? { pausedUntil: new Date(pausedUntil).toISOString() } : {}),
              }, "Zone paused")}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} Pause zone
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Retire (deactivate) */}
      <AlertDialog open={dialog === "deactivate"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-neutral h-11 w-11"><Power className="h-5 w-5" /></div>
            <AlertDialogTitle>Retire {zone.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The zone stops applying to point resolution. Outlets inside it fall back to whatever
              other active zone covers them (or the registration-only floor). You can reactivate it
              later, or delete it once no outlets reference it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialog(null)} disabled={pending}>Cancel</Button>
            <Button type="button" variant="destructive" className="rounded-full gap-1.5" disabled={pending}
              onClick={() => void send(`/api/zones/${zone.id}/deactivate${q}`, "POST", {}, "Zone retired")}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} Retire zone
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete */}
      <AlertDialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-danger h-11 w-11"><Trash2 className="h-5 w-5" /></div>
            <AlertDialogTitle>Delete {zone.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanent. Only possible when no outlets are assigned to this zone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialog(null)} disabled={pending}>Cancel</Button>
            <Button type="button" variant="destructive" className="rounded-full gap-1.5" disabled={pending}
              onClick={async () => { const ok = await send(`/api/zones/${zone.id}${q}`, "DELETE", undefined, "Zone deleted"); if (ok) onClose() }}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} Delete zone
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
