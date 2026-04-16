"use client"

import { useState }       from "react"
import Image              from "next/image"
import { FileText, ImageIcon, Expand, X, Loader2, AlertCircle } from "lucide-react"
import { Button }         from "@repo/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@repo/ui/components/dialog"

import type { Doc, ViewerState } from "@/types/vendor.types"

/**
 * DocumentViewer — in-page secure document preview.
 *
 * Fetches a short-lived (15min TTL) signed R2 URL via
 * /api/vendors/documents/:id/view — a route handler that
 * calls the backend which calls R2Service.generateViewUrl().
 *
 * PDF  → <iframe> with browser native renderer
 * Image → next/image (performance: optimisation, lazy loading)
 *
 * The bucket stays private. No direct R2 URL is ever exposed.
 * URL expires in 15 minutes and is never persisted beyond the Dialog.
 */
export function DocumentViewer({ document }: { document: Doc }) {
  const [state,  setState]  = useState<ViewerState>({ type: "idle" })
  const [isOpen, setIsOpen] = useState(false)

  const isPdf   = document.mimeType?.includes("pdf") || document.storageKey.toLowerCase().endsWith(".pdf")
  const isImage = document.mimeType?.startsWith("image/")
    || /\.(jpg|jpeg|png|webp|gif)$/i.test(document.storageKey)

  async function openViewer() {
    setIsOpen(true)
    setState({ type: "loading" })

    try {
      const res = await fetch(`/api/admin/vendors/documents/${document.id}/view`)
      if (!res.ok) {
        const err = await res.json()
        setState({ type: "error", message: err.message ?? "Could not load document." })
        return
      }
      const data = await res.json()
      setState({ type: "ready", url: data.url })
    } catch {
      setState({ type: "error", message: "Network error. Please try again." })
    }
  }

  function closeViewer() {
    setIsOpen(false)
    setTimeout(() => setState({ type: "idle" }), 300)
  }

  const docName = document.documentName ?? document.documentType.name

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={openViewer}
        aria-label={`Preview ${docName}`}
      >
        {isPdf ? <FileText className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
        Preview
        <Expand className="h-3 w-3 opacity-50" />
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) closeViewer() }}>
        <DialogContent
          className="flex h-[92vh] w-[96vw] max-w-5xl flex-col gap-0 overflow-hidden p-0"
          style={{ backgroundColor: "var(--card)" }}
        >
          {/* Header */}
          <div
            className="flex shrink-0 items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm font-semibold text-foreground">
                {document.documentType.name}
              </DialogTitle>
              {document.documentName && (
                <p className="truncate text-xs text-muted-foreground">{document.documentName}</p>
              )}
            </div>

            <div className="ml-3 flex shrink-0 items-center gap-2">
              <StatusBadge status={document.status} />
              {document.expiryDate && (
                <span className="hidden text-xs text-muted-foreground sm:block">
                  Expires {new Date(document.expiryDate).toLocaleDateString()}
                </span>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeViewer} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Body */}
          <div
            className="relative flex-1 overflow-hidden"
            style={{ backgroundColor: "var(--muted)" }}
          >
            {state.type === "loading" && (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {state.type === "error" && (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <AlertCircle className="h-10 w-10 text-destructive/60" />
                <p className="text-sm font-medium text-foreground">Failed to load document</p>
                <p className="max-w-xs text-xs text-muted-foreground">{state.message}</p>
                <Button size="sm" variant="outline" onClick={openViewer}>Try again</Button>
              </div>
            )}

            {state.type === "ready" && isPdf && (
              <iframe
                src={state.url}
                title={docName}
                className="h-full w-full border-0"
                sandbox="allow-same-origin allow-scripts"
              />
            )}

            {state.type === "ready" && isImage && (
              <div className="flex h-full items-center justify-center p-4">
                {/*
                  next/image requires known dimensions or fill mode.
                  We use fill + relative parent for responsive display.
                  The outer div constrains max-size via padding.
                */}
                <div className="relative h-full w-full">
                  <Image
                    src={state.url}
                    alt={docName}
                    fill
                    className="object-contain"
                    sizes="(max-width: 1024px) 95vw, 80vw"
                    unoptimized  // signed R2 URLs — no Next.js image CDN optimisation
                  />
                </div>
              </div>
            )}

            {state.type === "ready" && !isPdf && !isImage && (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <FileText className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Preview not available</p>
                <p className="text-xs text-muted-foreground">This file type cannot be previewed directly.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    APPROVED : "badge-success",
    REJECTED : "badge-danger",
    PENDING  : "badge-neutral",
    EXPIRED  : "badge-warning",
    WITHDRAWN: "badge-neutral",
  }
  return <span className={cls[status] ?? "badge-neutral"}>{status}</span>
}