"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Plus, TrendingUp, Store, Users, ChevronDown, ChevronRight, Check, X } from "lucide-react"
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
import type {
  CityMarketSignalSummary, MarketSignal, MarketSignalType, MarketSignalStatus,
} from "@repo/types/admin-app"
import { ZONE_LEVEL_META } from "./zone-meta"

interface Props {
  citySlug      : string
  centroid      : { latitude: number | null; longitude: number | null }
  initialSummary: CityMarketSignalSummary | null
  canWrite      : boolean
}

const TYPE_LABEL: Record<MarketSignalType, string> = {
  VENDOR_INTEREST  : "Vendor interest",
  CUSTOMER_INTEREST: "Customer interest",
}

export function CityLaunchSignalsPanel({ citySlug, centroid, initialSummary, canWrite }: Props) {
  const router = useRouter()
  const [logOpen, setLogOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [pending, setPending] = useState(false)

  const [signals, setSignals] = useState<MarketSignal[] | null>(null)
  const [loadingList, setLoadingList] = useState(false)

  const [type, setType] = useState<MarketSignalType>("CUSTOMER_INTEREST")
  const [lat, setLat] = useState(centroid.latitude?.toString() ?? "")
  const [lng, setLng] = useState(centroid.longitude?.toString() ?? "")
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [note, setNote] = useState("")

  const s = initialSummary

  async function loadList() {
    setListOpen((o) => !o)
    if (signals || listOpen) return
    setLoadingList(true)
    try {
      const res = await fetch(`/api/cities/${citySlug}/market-signals?pageSize=25`)
      const data = await res.json()
      if (res.ok) setSignals(data.signals ?? [])
    } catch { /* silent */ } finally { setLoadingList(false) }
  }

  async function logSignal() {
    const latN = Number(lat), lngN = Number(lng)
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) { toast.error("Enter valid coordinates"); return }
    setPending(true)
    try {
      const res = await fetch(`/api/cities/${citySlug}/market-signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type, latitude: latN, longitude: lngN,
          contactName: contactName.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          note: note.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error("Couldn't log the signal", { description: data?.message }); return }
      toast.success("Signal logged")
      setLogOpen(false)
      setContactName(""); setContactEmail(""); setNote("")
      setSignals(null)
      router.refresh()
    } catch {
      toast.error("Network error")
    } finally { setPending(false) }
  }

  async function setStatus(id: string, status: MarketSignalStatus) {
    setPending(true)
    try {
      const res = await fetch(`/api/market-signals/${id}/status?cityRef=${citySlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error("Update failed", { description: data?.message }); return }
      setSignals((prev) => prev?.map((x) => (x.id === id ? { ...x, status } : x)) ?? null)
      router.refresh()
    } catch {
      toast.error("Network error")
    } finally { setPending(false) }
  }

  return (
    <div className="admin-card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <TrendingUp className="h-4 w-4 text-primary" /> Launch signals
        </h2>
        {canWrite && (
          <Button type="button" size="sm" className="h-8 rounded-full gap-1.5" onClick={() => setLogOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Log interest
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Supply and demand gathered ahead of operating. Two independent signals that inform — never
        auto-trigger — creating a zone or raising one&apos;s level.
      </p>

      {!s ? (
        <p className="text-xs text-muted-foreground">No signal data.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat icon={Store} label="Vendor interest" value={s.totals.vendorInterest} />
            <Stat icon={Users} label="Customer interest" value={s.totals.customerInterest} />
            <Stat label="Actioned" value={s.totals.actioned} muted />
            <Stat label="Dismissed" value={s.totals.dismissed} muted />
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-2.5 py-1.5 text-left font-medium">Area</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Vendors</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Customers</th>
                </tr>
              </thead>
              <tbody>
                {s.byZone.map((z) => (
                  <tr key={z.zoneId} className="border-t border-border">
                    <td className="px-2.5 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: ZONE_LEVEL_META[z.level].color }} />
                        <span className="font-medium text-foreground">{z.zoneName}</span>
                        <span className="text-muted-foreground">· {ZONE_LEVEL_META[z.level].short}</span>
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{z.vendorInterest || "—"}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{z.customerInterest || "—"}</td>
                  </tr>
                ))}
                <SplitRow label="Inside boundary, unzoned" b={s.unzonedInsideBoundary} />
                <SplitRow label="Outside boundary" b={s.outsideBoundary} />
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={loadList}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {listOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Recent signals
          </button>

          {listOpen && (
            <div className="space-y-1.5">
              {loadingList && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {!loadingList && signals?.length === 0 && (
                <p className="text-xs text-muted-foreground">No signals logged yet.</p>
              )}
              {signals?.map((sig) => (
                <div key={sig.id} className="flex items-start justify-between gap-2 rounded-lg border border-border px-2.5 py-2 text-xs">
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">{TYPE_LABEL[sig.type]}</span>
                    <span className="text-muted-foreground">
                      {" · "}{sig.zoneName ?? (sig.withinCityBoundary ? "unzoned" : "outside boundary")}
                      {sig.status !== "OPEN" && ` · ${sig.status.toLowerCase()}`}
                    </span>
                    {(sig.contactName || sig.note) && (
                      <p className="mt-0.5 truncate text-muted-foreground">
                        {[sig.contactName, sig.note].filter(Boolean).join(" — ")}
                      </p>
                    )}
                  </div>
                  {canWrite && (
                    <span className="flex shrink-0 gap-1">
                      {sig.status !== "ACTIONED" && (
                        <button type="button" disabled={pending} title="Mark actioned"
                          onClick={() => setStatus(sig.id, "ACTIONED")}
                          className="rounded-full p-1 text-muted-foreground hover:bg-success-bg hover:text-success">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {sig.status !== "DISMISSED" && (
                        <button type="button" disabled={pending} title="Dismiss"
                          onClick={() => setStatus(sig.id, "DISMISSED")}
                          className="rounded-full p-1 text-muted-foreground hover:bg-destructive-bg hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Log interest dialog */}
      <AlertDialog open={logOpen} onOpenChange={(o) => !o && setLogOpen(false)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-primary h-11 w-11"><TrendingUp className="h-5 w-5" /></div>
            <AlertDialogTitle>Log a market signal</AlertDialogTitle>
            <AlertDialogDescription>
              Record interest from a vendor or a customer at a location. It&apos;s placed in the
              zone it falls in (or the unzoned/outside bucket).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as MarketSignalType)}>
                <SelectTrigger className="rounded-xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CUSTOMER_INTEREST">Customer interest</SelectItem>
                  <SelectItem value="VENDOR_INTEREST">Vendor interest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="sig-lat">Latitude</Label>
                <Input id="sig-lat" value={lat} onChange={(e) => setLat(e.target.value)} className="rounded-xl text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="sig-lng">Longitude</Label>
                <Input id="sig-lng" value={lng} onChange={(e) => setLng(e.target.value)} className="rounded-xl text-sm" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Defaults to the city centre — adjust to the actual location.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="sig-name">Contact name</Label>
                <Input id="sig-name" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Optional" className="rounded-xl text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="sig-email">Contact email</Label>
                <Input id="sig-email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Optional" className="rounded-xl text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="sig-note">Note</Label>
              <Textarea id="sig-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 3 restaurants on this street asked about joining" className="min-h-16 text-sm" />
            </div>
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setLogOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="button" className="rounded-full gap-1.5" disabled={pending} onClick={logSignal}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} Log signal
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Stat({ icon: Icon, label, value, muted }: { icon?: typeof Store; label: string; value: number; muted?: boolean }) {
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${muted ? "border-border" : "border-primary/20 bg-primary-subtle/30"}`}>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function SplitRow({ label, b }: { label: string; b: { vendorInterest: number; customerInterest: number } }) {
  return (
    <tr className="border-t border-border bg-muted/20">
      <td className="px-2.5 py-1.5 italic text-muted-foreground">{label}</td>
      <td className="px-2.5 py-1.5 text-right tabular-nums">{b.vendorInterest || "—"}</td>
      <td className="px-2.5 py-1.5 text-right tabular-nums">{b.customerInterest || "—"}</td>
    </tr>
  )
}
