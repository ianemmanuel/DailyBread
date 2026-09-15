"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Loader2, ClipboardCheck, CheckCircle2, XCircle, Clock, CalendarClock, Ban, ShieldOff, Camera, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import type { OutletInspectionRow, OutletInspectionStatus } from "@/types"

const STATUS: Record<OutletInspectionStatus, { label: string; cls: string; icon: typeof Clock }> = {
  SCHEDULED  : { label: "Scheduled",   cls: "badge-warning", icon: CalendarClock },
  IN_PROGRESS: { label: "In progress", cls: "badge-warning", icon: Clock },
  PASSED     : { label: "Passed",      cls: "badge-success", icon: CheckCircle2 },
  FAILED     : { label: "Failed",      cls: "badge-danger",  icon: XCircle },
  WAIVED     : { label: "Waived",      cls: "badge-neutral", icon: ShieldOff },
  CANCELLED  : { label: "Cancelled",   cls: "badge-neutral", icon: Ban },
}

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString() : "—"
}

export function OutletInspectionsPanel({
  outletId, inspections, canInspect, inspectionRequired,
}: {
  outletId: string
  inspections: OutletInspectionRow[]
  canInspect: boolean
  inspectionRequired: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | "schedule" | "waive" | "record" | "cancel">(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [photoView, setPhotoView] = useState<{ id: string; urls: string[] } | null>(null)
  const [loadingPhotos, setLoadingPhotos] = useState<string | null>(null)

  // form state
  const [scheduledFor, setScheduledFor] = useState("")
  const [notes, setNotes] = useState("")
  const [reason, setReason] = useState("")
  const [validUntil, setValidUntil] = useState("")
  const [outcome, setOutcome] = useState<"PASS" | "FAIL">("PASS")
  const [findings, setFindings] = useState("")
  const [failureReasons, setFailureReasons] = useState("")
  const [photoKeys, setPhotoKeys] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const active = inspections.find((i) => i.status === "SCHEDULED" || i.status === "IN_PROGRESS") ?? null
  const latestResolved = inspections.find((i) => ["PASSED", "FAILED", "WAIVED"].includes(i.status)) ?? null

  function resetForms() {
    setScheduledFor(""); setNotes(""); setReason(""); setValidUntil("")
    setOutcome("PASS"); setFindings(""); setFailureReasons(""); setPhotoKeys([])
  }

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || "Action failed")
    return data
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    try {
      await fn()
      setDialog(null); setActiveId(null); resetForms()
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong")
    } finally { setBusy(null) }
  }

  async function openPhotos(inspectionId: string) {
    setLoadingPhotos(inspectionId)
    try {
      const res = await fetch(`/api/vendors/outlet-inspections/${inspectionId}`)
      const data = await res.json().catch(() => ({}))
      const urls: string[] = data?.data?.photos ?? data?.photos ?? []
      if (!res.ok) { toast.error(data?.message || "Couldn't load photos"); return }
      setPhotoView({ id: inspectionId, urls })
    } catch {
      toast.error("Network error")
    } finally { setLoadingPhotos(null) }
  }

  async function uploadPhotos(files: FileList) {
    if (!activeId) return
    setUploading(true)
    try {
      const keys: string[] = []
      for (const file of Array.from(files)) {
        const presign = await post(`/api/vendors/outlet-inspections/${activeId}/photo-presign`, {
          fileName: file.name, fileType: file.type,
        })
        const url = presign?.data?.uploadUrl ?? presign?.uploadUrl
        const key = presign?.data?.storageKey ?? presign?.storageKey
        if (!url || !key) throw new Error("Could not prepare the upload")
        const put = await fetch(url, { method: "PUT", headers: { "Content-Type": file.type }, body: file })
        if (!put.ok) throw new Error("Upload failed")
        keys.push(key)
      }
      setPhotoKeys((prev) => [...prev, ...keys])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="admin-card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Premises inspections</h2>
        {canInspect && !active && (
          <div className="flex items-center gap-1.5">
            <Button type="button" size="sm" className="h-8 rounded-full gap-1"
              onClick={() => { resetForms(); setDialog("schedule") }}>
              <CalendarClock className="h-3.5 w-3.5" /> Schedule
            </Button>
            {inspectionRequired && (
              <Button type="button" size="sm" variant="outline" className="h-8 rounded-full gap-1"
                onClick={() => { resetForms(); setDialog("waive") }}>
                <ShieldOff className="h-3.5 w-3.5" /> Waive
              </Button>
            )}
          </div>
        )}
      </div>

      {!inspectionRequired && (
        <p className="text-xs text-muted-foreground">
          This country&apos;s policy does not require a premises inspection. Any inspection recorded here is informational.
        </p>
      )}

      {inspections.length === 0 ? (
        <p className="text-xs text-muted-foreground">No inspections on record for this outlet.</p>
      ) : (
        <div className="space-y-2">
          {inspections.map((ins) => {
            const meta = STATUS[ins.status]
            const Icon = meta.icon
            return (
              <div key={ins.id} className="rounded-lg border border-border px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 text-xs">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className={meta.cls}>{meta.label}</span>
                        {ins.scheduledFor && <span className="text-muted-foreground">scheduled {fmt(ins.scheduledFor)}</span>}
                        {ins.completedAt && <span className="text-muted-foreground">· completed {fmt(ins.completedAt)}</span>}
                        {ins.validUntil && <span className="text-muted-foreground">· valid until {fmt(ins.validUntil)}</span>}
                      </p>
                      {ins.findings && <p className="mt-1 text-foreground">{ins.findings}</p>}
                      {ins.failureReasons.length > 0 && (
                        <p className="mt-1 text-destructive">Failed: {ins.failureReasons.join("; ")}</p>
                      )}
                      {ins.waiveReason && <p className="mt-1 text-muted-foreground">Waived: {ins.waiveReason}</p>}
                      {ins.notes && <p className="mt-1 text-muted-foreground">{ins.notes}</p>}
                      {ins.photoCount > 0 && (
                        <button type="button"
                          className="mt-1 inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
                          disabled={loadingPhotos === ins.id}
                          onClick={() => openPhotos(ins.id)}>
                          {loadingPhotos === ins.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Camera className="h-3 w-3" />}
                          {ins.photoCount} photo{ins.photoCount === 1 ? "" : "s"}
                        </button>
                      )}
                    </div>
                  </div>

                  {canInspect && (ins.status === "SCHEDULED" || ins.status === "IN_PROGRESS") && (
                    <div className="flex shrink-0 items-center gap-1">
                      {ins.status === "SCHEDULED" && (
                        <Button type="button" size="sm" className="h-8 rounded-full"
                          disabled={busy === ins.id + "start"}
                          onClick={() => run(ins.id + "start", async () => {
                            await post(`/api/vendors/outlet-inspections/${ins.id}/start?outletId=${outletId}`)
                          })}>
                          {busy === ins.id + "start" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Start"}
                        </Button>
                      )}
                      {ins.status === "IN_PROGRESS" && (
                        <Button type="button" size="sm" className="h-8 rounded-full"
                          onClick={() => { resetForms(); setActiveId(ins.id); setDialog("record") }}>
                          Record outcome
                        </Button>
                      )}
                      <Button type="button" size="sm" variant="outline" className="h-8 rounded-full"
                        onClick={() => { setActiveId(ins.id); setReason(""); setDialog("cancel") }}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {latestResolved && !active && (
        <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
          Most recent outcome: <span className="font-medium text-foreground">{STATUS[latestResolved.status].label}</span> on {fmt(latestResolved.completedAt)}.
        </p>
      )}

      {/* Schedule */}
      <AlertDialog open={dialog === "schedule"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-primary h-11 w-11"><CalendarClock className="h-5 w-5" /></div>
            <AlertDialogTitle>Schedule a premises inspection</AlertDialogTitle>
            <AlertDialogDescription>The vendor is notified of the date and told to have the premises ready.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="ins-date">Scheduled date</Label>
              <Input id="ins-date" type="date" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="ins-notes">Notes (optional)</Label>
              <Textarea id="ins-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the inspector or vendor should know" className="min-h-14 text-sm" />
            </div>
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="button" className="rounded-full gap-1.5" disabled={busy === "schedule"}
              onClick={() => run("schedule", async () => {
                await post(`/api/vendors/outlets/${outletId}/inspections`, {
                  scheduledFor: scheduledFor || null, notes: notes.trim() || undefined,
                })
                toast.success("Inspection scheduled")
              })}>
              {busy === "schedule" && <Loader2 className="h-4 w-4 animate-spin" />} Schedule
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Waive */}
      <AlertDialog open={dialog === "waive"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-warning h-11 w-11"><ShieldOff className="h-5 w-5" /></div>
            <AlertDialogTitle>Waive the inspection requirement</AlertDialogTitle>
            <AlertDialogDescription>
              This outlet will be treated as meal-plan eligible without a physical inspection. Recorded and audit-logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="wv-reason">Reason *</Label>
              <Textarea id="wv-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Why the inspection is being waived" className="min-h-14 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="wv-valid">Valid until (optional)</Label>
              <Input id="wv-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="button" variant="destructive" className="rounded-full gap-1.5"
              disabled={!reason.trim() || busy === "waive"}
              onClick={() => run("waive", async () => {
                await post(`/api/vendors/outlets/${outletId}/inspections/waive`, {
                  reason: reason.trim(), validUntil: validUntil || null,
                })
                toast.success("Inspection requirement waived")
              })}>
              {busy === "waive" && <Loader2 className="h-4 w-4 animate-spin" />} Waive
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel */}
      <AlertDialog open={dialog === "cancel"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-warning h-11 w-11"><Ban className="h-5 w-5" /></div>
            <AlertDialogTitle>Cancel this inspection</AlertDialogTitle>
            <AlertDialogDescription>The vendor is notified that the visit was called off.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="cx-reason">Reason (optional)</Label>
            <Textarea id="cx-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-14 text-sm" />
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialog(null)}>Keep it</Button>
            <Button type="button" variant="destructive" className="rounded-full gap-1.5" disabled={busy === "cancel"}
              onClick={() => activeId && run("cancel", async () => {
                await post(`/api/vendors/outlet-inspections/${activeId}/cancel?outletId=${outletId}`, { reason: reason.trim() || undefined })
                toast.success("Inspection cancelled")
              })}>
              {busy === "cancel" && <Loader2 className="h-4 w-4 animate-spin" />} Cancel inspection
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Photo viewer */}
      <AlertDialog open={!!photoView} onOpenChange={(o) => !o && setPhotoView(null)}>
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Inspection photos</AlertDialogTitle>
            <AlertDialogDescription>Captured during the visit.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(photoView?.urls ?? []).map((url) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Inspection" className="aspect-square w-full rounded-lg object-cover" />
              </a>
            ))}
            {photoView && photoView.urls.length === 0 && (
              <p className="col-span-full text-sm text-muted-foreground">No photos.</p>
            )}
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setPhotoView(null)}>Close</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Record outcome */}
      <AlertDialog open={dialog === "record"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-primary h-11 w-11"><ClipboardCheck className="h-5 w-5" /></div>
            <AlertDialogTitle>Record inspection outcome</AlertDialogTitle>
            <AlertDialogDescription>The vendor is notified of the result.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button type="button" variant={outcome === "PASS" ? "default" : "outline"} className="flex-1 rounded-full"
                onClick={() => setOutcome("PASS")}>Pass</Button>
              <Button type="button" variant={outcome === "FAIL" ? "destructive" : "outline"} className="flex-1 rounded-full"
                onClick={() => setOutcome("FAIL")}>Fail</Button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="rc-findings">Inspector findings</Label>
              <Textarea id="rc-findings" value={findings} onChange={(e) => setFindings(e.target.value)}
                placeholder="Notes from the visit" className="min-h-16 text-sm" />
            </div>
            {outcome === "FAIL" && (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="rc-reasons">Failure reasons * (one per line)</Label>
                <Textarea id="rc-reasons" value={failureReasons} onChange={(e) => setFailureReasons(e.target.value)}
                  placeholder={"e.g. No hand-washing station\nExpired fire certificate"} className="min-h-16 text-sm" />
              </div>
            )}
            {outcome === "PASS" && (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="rc-valid">Re-inspection due (optional)</Label>
                <Input id="rc-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Photos</Label>
              <div className="flex flex-wrap items-center gap-2">
                {photoKeys.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px]">
                    <Camera className="h-3 w-3" />
                    <span className="max-w-24 truncate">{k.split("/").pop()}</span>
                    <button type="button" onClick={() => setPhotoKeys((p) => p.filter((x) => x !== k))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <Button type="button" size="sm" variant="outline" className="h-8 rounded-full gap-1"
                  disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />} Add
                </Button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
                  onChange={(e) => e.target.files && e.target.files.length > 0 && uploadPhotos(e.target.files)} />
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="button" className="rounded-full gap-1.5"
              disabled={busy === "record" || uploading || (outcome === "FAIL" && !failureReasons.trim())}
              onClick={() => activeId && run("record", async () => {
                await post(`/api/vendors/outlet-inspections/${activeId}/record?outletId=${outletId}`, {
                  outcome,
                  findings: findings.trim() || undefined,
                  failureReasons: outcome === "FAIL"
                    ? failureReasons.split("\n").map((s) => s.trim()).filter(Boolean)
                    : undefined,
                  validUntil: outcome === "PASS" ? (validUntil || null) : null,
                  photoKeys,
                })
                toast.success(`Inspection recorded as ${outcome === "PASS" ? "passed" : "failed"}`)
              })}>
              {busy === "record" && <Loader2 className="h-4 w-4 animate-spin" />} Save outcome
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
