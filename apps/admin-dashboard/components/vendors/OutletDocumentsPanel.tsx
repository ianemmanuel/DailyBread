"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Loader2, FileText, CheckCircle2, XCircle, Clock, AlertTriangle, ShieldAlert, Eye, Check, Undo2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import type { AdminOutletDocumentRow, VendorDocumentActionStatus } from "@/types"

const STATUS: Record<VendorDocumentActionStatus, { label: string; cls: string; icon: typeof FileText }> = {
  MISSING       : { label: "Missing", cls: "badge-danger", icon: FileText },
  NOT_UPLOADED  : { label: "Not uploaded", cls: "badge-neutral", icon: FileText },
  PENDING_REVIEW: { label: "Pending review", cls: "badge-warning", icon: Clock },
  APPROVED      : { label: "Approved", cls: "badge-success", icon: CheckCircle2 },
  EXPIRING_SOON : { label: "Expiring soon", cls: "badge-warning", icon: AlertTriangle },
  EXPIRED       : { label: "Expired", cls: "badge-danger", icon: XCircle },
  REJECTED      : { label: "Sent back", cls: "badge-danger", icon: XCircle },
}

export function OutletDocumentsPanel({
  outletId, documents, canModerate,
}: {
  outletId: string
  documents: AdminOutletDocumentRow[]
  canModerate: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [rejectFor, setRejectFor] = useState<AdminOutletDocumentRow | null>(null)
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")

  async function act(documentId: string, action: "approve" | "reject", body?: unknown) {
    setBusy(documentId + action)
    try {
      const res = await fetch(`/api/vendors/outlet-documents/${documentId}/${action}?outletId=${outletId}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error("Action failed", { description: data?.message }); return }
      toast.success(action === "approve" ? "Document approved" : "Sent back for revision")
      setRejectFor(null); setReason(""); setNotes("")
      router.refresh()
    } catch {
      toast.error("Network error")
    } finally { setBusy(null) }
  }

  async function preview(documentId: string) {
    try {
      const res = await fetch(`/api/vendors/outlet-documents/${documentId}/signed-url`)
      const data = await res.json()
      if (res.ok && data?.url) window.open(data.url, "_blank", "noopener,noreferrer")
      else toast.error("Couldn't open the document")
    } catch { toast.error("Couldn't open the document") }
  }

  if (documents.length === 0) {
    return (
      <div className="admin-card">
        <h2 className="text-sm font-semibold text-foreground">Documents</h2>
        <p className="mt-1 text-xs text-muted-foreground">No document types apply to this outlet.</p>
      </div>
    )
  }

  return (
    <div className="admin-card space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Documents</h2>
      <div className="space-y-2">
        {documents.map((row) => {
          const meta = STATUS[row.actionStatus]
          const Icon = meta.icon
          const doc = row.currentDocument
          return (
            <div key={row.documentTypeId} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <div className="flex min-w-0 items-start gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                    {row.documentTypeName}
                    {row.isRequired && <span className="badge-neutral text-[10px]">Required</span>}
                    {row.severity === "CRITICAL" && (
                      <span className="badge-warning inline-flex items-center gap-1 text-[10px]">
                        <ShieldAlert className="h-3 w-3" /> Gates go-live
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={meta.cls}>{meta.label}</span>
                    {doc?.version && doc.version > 1 && <span>v{doc.version}</span>}
                    {doc?.expiryDate && <span>· expires {new Date(doc.expiryDate).toLocaleDateString()}</span>}
                    {doc?.submittedAt && <span>· submitted {new Date(doc.submittedAt).toLocaleDateString()}</span>}
                  </p>
                  {doc?.status === "REJECTED" && (doc.revisionNotes || doc.rejectionReason) && (
                    <p className="mt-1 text-xs text-destructive">{doc.revisionNotes || doc.rejectionReason}</p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {doc && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 gap-1" onClick={() => preview(doc.id)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                )}
                {canModerate && doc && row.actionStatus === "PENDING_REVIEW" && (
                  <>
                    <Button type="button" size="sm" className="h-8 gap-1 rounded-full"
                      disabled={busy === doc.id + "approve"}
                      onClick={() => act(doc.id, "approve")}>
                      {busy === doc.id + "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Approve
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1 rounded-full"
                      onClick={() => { setRejectFor(row); setReason(""); setNotes("") }}>
                      <Undo2 className="h-3.5 w-3.5" /> Send back
                    </Button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <AlertDialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-warning h-11 w-11"><Undo2 className="h-5 w-5" /></div>
            <AlertDialogTitle>Send back {rejectFor?.documentTypeName}</AlertDialogTitle>
            <AlertDialogDescription>
              The vendor sees the notes below and can upload a corrected version. If this is a
              CRITICAL document, the outlet stays / returns to pending until it&apos;s approved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="odr-reason">Internal reason *</Label>
              <Textarea id="odr-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Document is illegible / expired / wrong permit type" className="min-h-14 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="odr-notes">Notes for the vendor</Label>
              <Textarea id="odr-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="What they need to do to fix it" className="min-h-14 text-sm" />
            </div>
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button type="button" variant="destructive" className="rounded-full gap-1.5"
              disabled={!reason.trim() || busy === rejectFor?.currentDocument?.id + "reject"}
              onClick={() => rejectFor?.currentDocument && act(rejectFor.currentDocument.id, "reject", { rejectionReason: reason.trim(), revisionNotes: notes.trim() || undefined })}>
              {busy === rejectFor?.currentDocument?.id + "reject" && <Loader2 className="h-4 w-4 animate-spin" />}
              Send back
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
