"use client"

import { useState, useRef, useEffect } from "react"
import Image from "next/image"
import { toast } from "sonner"
import {
  FileText,
  ImageIcon,
  ChevronDown,
  Loader2,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { Button }              from "@repo/ui/components/button"
import { TableCell, TableRow } from "@repo/ui/components/table"
import type { Doc, ViewerState } from "@/types/vendor.types"

interface DocumentRowProps {
  doc           : Doc
  canApprove?   : boolean
  applicationId : string
  /**
   * Fired after a successful approve or reject so the parent (DocumentsSection)
   * can re-evaluate whether all documents are APPROVED and unlock the
   * application-level Approve button.
   */
  onStatusChange?: (docId: string, newStatus: string) => void
}

export function DocumentRow({
  doc,
  canApprove,
  applicationId,
  onStatusChange,
}: DocumentRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [state,    setState]    = useState<ViewerState>({ type: "idle" })
  const [blobUrl,  setBlobUrl]  = useState<string | null>(null)

  const [acting,        setActing]        = useState<"approve" | "reject" | null>(null)
  const [actionError,   setActionError]   = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const [showRejectForm,  setShowRejectForm]  = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [revisionNotes,   setRevisionNotes]   = useState("")

  // Optimistic local status — badge updates instantly without page reload
  const [docStatus, setDocStatus] = useState(doc.status)

  const panelRef = useRef<HTMLTableRowElement>(null)

  const isPdf   = doc.mimeType?.includes("pdf")      || doc.storageKey.toLowerCase().endsWith(".pdf")
  const isImage = doc.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)$/i.test(doc.storageKey)
  const docName = doc.documentName ?? doc.documentType.name

  // ── Load on first expand ────────────────────────────────────────────────────
  useEffect(() => {
    if (!expanded || state.type !== "idle") return
    loadDocument()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  // ── Scroll into view ────────────────────────────────────────────────────────
  useEffect(() => {
    if (expanded && panelRef.current) {
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150)
    }
  }, [expanded])

  // ── Cleanup on collapse ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!expanded && blobUrl) {
      const url = blobUrl
      setBlobUrl(null)
      setState({ type: "idle" })
      setShowRejectForm(false)
      setActionError(null)
      setActionSuccess(null)
      setTimeout(() => URL.revokeObjectURL(url), 400)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  // ── Fetch signed URL + blob ─────────────────────────────────────────────────
  async function loadDocument() {
    setState({ type: "loading" })
    try {
      const res = await fetch(`/api/vendors/documents/${doc.id}/view`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setState({ type: "error", message: err.message ?? "Could not load document." })
        return
      }
      const { url } = await res.json()
      if (isPdf) {
        const pdfRes = await fetch(url)
        if (!pdfRes.ok) throw new Error("Failed to fetch PDF bytes")
        const blob     = await pdfRes.blob()
        const localUrl = URL.createObjectURL(blob)
        setBlobUrl(localUrl)
        setState({ type: "ready", url: localUrl })
      } else {
        setState({ type: "ready", url })
      }
    } catch {
      setState({ type: "error", message: "Network error. Please try again." })
    }
  }

  async function dispatchAction(
    action : "approve" | "reject",
    body?  : object,
  ): Promise<{ ok: boolean; message?: string }> {
    const res = await fetch(
      `/api/vendors/documents/${doc.id}/${action}`,
      {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : body ? JSON.stringify(body) : undefined,
      },
    )
    const data = await res.json()
    return { ok: res.ok, message: data.message }
  }

  // ── Approve ─────────────────────────────────────────────────────────────────
  async function handleApprove(e: React.MouseEvent) {
    e.stopPropagation()
    setActing("approve")
    setActionError(null)
    setActionSuccess(null)
    try {
      const { ok, message } = await dispatchAction("approve")
      if (!ok) {
        const msg = message ?? "Failed to approve document."
        setActionError(msg)
        toast.error("Approval failed", { description: msg })
      } else {
        setDocStatus("APPROVED")
        setActionSuccess("Document approved successfully.")
        onStatusChange?.(doc.id, "APPROVED")
        toast.success("Document approved", {
          description: `"${docName}" has been marked as approved.`,
        })
      }
    } catch {
      const msg = "Network error. Please try again."
      setActionError(msg)
      toast.error("Approval failed", { description: msg })
    } finally {
      setActing(null)
    }
  }

  // ── Reject ──────────────────────────────────────────────────────────────────
  async function handleReject(e: React.MouseEvent) {
    e.stopPropagation()
    if (!rejectionReason.trim()) return
    setActing("reject")
    setActionError(null)
    setActionSuccess(null)
    try {
      const { ok, message } = await dispatchAction("reject", {
        rejectionReason: rejectionReason.trim(),
        revisionNotes  : revisionNotes.trim() || undefined,
      })
      if (!ok) {
        const msg = message ?? "Failed to reject document."
        setActionError(msg)
        toast.error("Rejection failed", { description: msg })
      } else {
        setDocStatus("REJECTED")
        setActionSuccess("Document rejected.")
        setShowRejectForm(false)
        setRejectionReason("")
        setRevisionNotes("")
        onStatusChange?.(doc.id, "REJECTED")
        toast.error("Document rejected", {
          description: `"${docName}" has been rejected. The vendor will need to resubmit.`,
        })
      }
    } catch {
      const msg = "Network error. Please try again."
      setActionError(msg)
      toast.error("Rejection failed", { description: msg })
    } finally {
      setActing(null)
    }
  }

  const statusCls: Record<string, string> = {
    APPROVED : "badge-success",
    REJECTED : "badge-danger",
    PENDING  : "badge-neutral",
    EXPIRED  : "badge-warning",
    WITHDRAWN: "badge-neutral",
  }

  const isPending  = docStatus === "PENDING"
  const isApproved = docStatus === "APPROVED"
  const isRejected = docStatus === "REJECTED"
  const canAct     = canApprove && isPending

  return (
    <>
      {/* ── Main data row ── */}
      <TableRow
        className="hover:bg-muted/10 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell>
          <div className="flex items-center gap-2">
            {isPdf
              ? <FileText  className="h-4 w-4 shrink-0 text-muted-foreground" />
              : <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            }
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{doc.documentType?.name}</p>
              {doc.documentName && (
                <p className="text-xs text-muted-foreground truncate max-w-45">{doc.documentName}</p>
              )}
            </div>
          </div>
        </TableCell>

        <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
          {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : "—"}
        </TableCell>

        <TableCell>
          <span className={statusCls[docStatus] ?? "badge-neutral"}>{docStatus}</span>
        </TableCell>

        <TableCell className="text-right pr-4">
          <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <span className="hidden sm:inline">{expanded ? "Collapse" : "Preview"}</span>
            <ChevronDown
              className="h-4 w-4 transition-transform duration-200"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </div>
        </TableCell>
      </TableRow>

      {/* ── Expanded preview panel ── */}
      {expanded && (
        <TableRow ref={panelRef} className="bg-muted/5 hover:bg-muted/5">
          <TableCell colSpan={4} className="p-0">
            <div style={{ animation: "expandDown 0.2s ease-out" }}>

              {/* Panel header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 bg-muted/30 px-4 py-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {docName}
                  {doc.expiryDate && (
                    <span className="ml-2 opacity-70">
                      · Expires {new Date(doc.expiryDate).toLocaleDateString()}
                    </span>
                  )}
                </p>

                <div className="flex items-center gap-2">
                  {state.type === "ready" && (
                    <a
                      href={state.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
                      aria-label="Open in new tab"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                  )}

                  {canAct && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 border-destructive/40 px-2 text-xs text-destructive hover:bg-destructive/10"
                        disabled={!!acting}
                        onClick={(e) => { e.stopPropagation(); setShowRejectForm((v) => !v) }}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 border-green-500/40 px-2 text-xs text-green-600 hover:bg-green-500/10"
                        disabled={!!acting}
                        onClick={handleApprove}
                      >
                        {acting === "approve"
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <CheckCircle2 className="h-3.5 w-3.5" />
                        }
                        Approve
                      </Button>
                    </>
                  )}

                  {isApproved && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                    </span>
                  )}
                  {isRejected && (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <XCircle className="h-3.5 w-3.5" /> Rejected
                    </span>
                  )}
                </div>
              </div>

              {/* Inline reject form */}
              {showRejectForm && canAct && (
                <div
                  className="border-b border-border/40 bg-destructive/5 px-4 py-3 space-y-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-xs font-semibold text-destructive">Reject document</p>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Reason <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-destructive/50"
                      placeholder="e.g. Document is expired or unreadable"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Revision notes <span className="opacity-50">(optional)</span>
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border"
                      placeholder="e.g. Please re-upload a clearer scan"
                      value={revisionNotes}
                      onChange={(e) => setRevisionNotes(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs"
                      disabled={!!acting}
                      onClick={(e) => { e.stopPropagation(); setShowRejectForm(false) }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 bg-destructive px-3 text-xs text-destructive-foreground hover:bg-destructive/90"
                      disabled={!rejectionReason.trim() || !!acting}
                      onClick={handleReject}
                    >
                      {acting === "reject"
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <XCircle className="h-3.5 w-3.5" />
                      }
                      Confirm rejection
                    </Button>
                  </div>
                </div>
              )}

              {/* Inline feedback banners — kept alongside toasts for in-context clarity */}
              {actionError && (
                <div
                  className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                  <p className="text-xs text-destructive">{actionError}</p>
                </div>
              )}
              {actionSuccess && (
                <div
                  className="flex items-center gap-2 border-b border-green-500/20 bg-green-500/5 px-4 py-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                  <p className="text-xs text-green-700">{actionSuccess}</p>
                </div>
              )}

              {/* Document body */}
              <div className="relative bg-muted/20" style={{ height: "480px" }}>
                {state.type === "loading" && (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                  </div>
                )}

                {state.type === "error" && (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <AlertCircle className="h-9 w-9 text-destructive/60" />
                    <p className="text-sm font-medium text-foreground">Failed to load document</p>
                    <p className="max-w-xs text-xs text-muted-foreground">{state.message}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); loadDocument() }}
                    >
                      Try again
                    </Button>
                  </div>
                )}

                {state.type === "ready" && isPdf && (
                  <iframe
                    src={state.url}
                    title={docName}
                    className="h-full w-full border-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}

                {state.type === "ready" && isImage && (
                  <div className="flex h-full items-center justify-center p-4">
                    <div className="relative h-full w-full">
                      <Image
                        src={state.url}
                        alt={docName}
                        fill
                        className="object-contain"
                        sizes="(max-width: 1024px) 95vw, 80vw"
                        unoptimized
                      />
                    </div>
                  </div>
                )}

                {state.type === "ready" && !isPdf && !isImage && (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <FileText className="h-9 w-9 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">Preview not available</p>
                    <p className="text-xs text-muted-foreground">
                      This file type cannot be previewed directly.
                    </p>
                  </div>
                )}
              </div>

            </div>
          </TableCell>
        </TableRow>
      )}

      <style>{`
        @keyframes expandDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}