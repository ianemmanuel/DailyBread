"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, ThumbsUp, ThumbsDown, ShieldAlert, RefreshCw, Ban, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import type { AdminOutlet } from "@/types"

interface Props {
  outlet: AdminOutlet
  /** VENDORS_OUTLETS_MODERATE */
  canModerate: boolean
}

type DialogKind = "reject" | "suspend" | "ban" | null

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json()
  return { ok: res.ok, data }
}

const DIALOG_META: Record<Exclude<DialogKind, null>, { title: string; description: string; confirmLabel: string }> = {
  reject : { title: "Reject outlet", description: "Blocks it as an unresolved flag and notifies nobody automatically — the vendor sees the reason on their own outlet page.", confirmLabel: "Reject" },
  suspend: { title: "Suspend outlet", description: "The vendor can't edit it while suspended. Reinstate lifts this.", confirmLabel: "Suspend" },
  ban    : { title: "Ban outlet", description: "A stronger, more permanent action than suspending — use for repeated or serious violations.", confirmLabel: "Ban" },
}

/**
 * Per-row outlet moderation — two independent axes: review (approve/
 * reject a vendor-side flag) and operational status (suspend/reinstate/
 * ban/unban), same split as admin.outlet.service.ts. Reject/suspend/ban
 * all require a reason; approve/reinstate/unban are single-click.
 */
export function OutletModerationActions({ outlet, canModerate }: Props) {
  const router = useRouter()
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)

  if (!canModerate) return null

  async function doApprove() {
    setPending(true)
    const { ok, data } = await postJson(`/api/vendors/outlets/${outlet.id}/approve`)
    if (ok) { toast.success("Outlet approved"); router.refresh() }
    else toast.error("Failed to approve", { description: data.message })
    setPending(false)
  }

  async function doReinstate() {
    setPending(true)
    const { ok, data } = await postJson(`/api/vendors/outlets/${outlet.id}/reinstate`)
    if (ok) { toast.success("Outlet reinstated"); router.refresh() }
    else toast.error("Failed to reinstate", { description: data.message })
    setPending(false)
  }

  async function doUnban() {
    setPending(true)
    const { ok, data } = await postJson(`/api/vendors/outlets/${outlet.id}/unban`)
    if (ok) { toast.success("Outlet unbanned"); router.refresh() }
    else toast.error("Failed to unban", { description: data.message })
    setPending(false)
  }

  async function doDialogConfirm() {
    if (!dialog) return
    if (!reason.trim()) { toast.error("A reason is required"); return }
    setPending(true)
    const { ok, data } = await postJson(`/api/vendors/outlets/${outlet.id}/${dialog}`, { reason: reason.trim() })
    if (ok) { toast.success(DIALOG_META[dialog].confirmLabel + "ed"); setDialog(null); router.refresh() }
    else toast.error(`Failed to ${dialog}`, { description: data.message })
    setPending(false)
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {outlet.reviewStatus === "FLAGGED" && (
        <>
          <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" disabled={pending} onClick={doApprove}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
            Approve
          </Button>
          <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5 text-destructive hover:text-destructive" disabled={pending} onClick={() => { setReason(""); setDialog("reject") }}>
            <ThumbsDown className="h-3.5 w-3.5" />
            Reject
          </Button>
        </>
      )}

      {outlet.adminStatus === "ACTIVE" && (
        <>
          <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5 border-warning/40 text-warning hover:bg-warning-bg" disabled={pending} onClick={() => { setReason(""); setDialog("suspend") }}>
            <ShieldAlert className="h-3.5 w-3.5" />
            Suspend
          </Button>
          <Button type="button" variant="destructive" size="sm" className="rounded-full gap-1.5" disabled={pending} onClick={() => { setReason(""); setDialog("ban") }}>
            <Ban className="h-3.5 w-3.5" />
            Ban
          </Button>
        </>
      )}

      {outlet.adminStatus === "SUSPENDED" && (
        <>
          <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" disabled={pending} onClick={doReinstate}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Reinstate
          </Button>
          <Button type="button" variant="destructive" size="sm" className="rounded-full gap-1.5" disabled={pending} onClick={() => { setReason(""); setDialog("ban") }}>
            <Ban className="h-3.5 w-3.5" />
            Ban
          </Button>
        </>
      )}

      {outlet.adminStatus === "BANNED" && (
        <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" disabled={pending} onClick={doUnban}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          Unban
        </Button>
      )}

      <AlertDialog open={dialog !== null} onOpenChange={(o) => !pending && !o && setDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          {dialog && (
            <>
              <AlertDialogHeader>
                <div className="icon-badge icon-badge-danger h-11 w-11"><ShieldAlert className="h-5 w-5" /></div>
                <AlertDialogTitle>{DIALOG_META[dialog].title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {outlet.name} — {DIALOG_META[dialog].description}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1.5">
                <Label className="text-xs">Reason *</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why…" className="min-h-20 text-sm" />
              </div>
              <AlertDialogFooter>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialog(null)} disabled={pending}>Cancel</Button>
                <Button type="button" variant="destructive" className="rounded-full gap-1.5" disabled={pending} onClick={doDialogConfirm}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {pending ? "Saving…" : DIALOG_META[dialog].confirmLabel}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
