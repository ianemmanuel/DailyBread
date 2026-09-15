"use client"

import * as React from "react"
import { FileText, ExternalLink } from "lucide-react"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger,
} from "@/components/ui/sheet"
import type { AdminPayoutProofDocument } from "@repo/types/admin-app"

/*
 * Payout-proof viewer — opens beside the review actions instead of throwing
 * the reviewer into a new tab. The decision (approve / reject) is made on
 * THIS page against the masked account number, holder name and bank code, so
 * sending them away to read the evidence and back again to act on it is the
 * wrong shape; a wide right-hand sheet keeps both in view.
 *
 * PDFs render in an <iframe>, images in an <img>. The URL is the short-lived
 * signed R2 link the server already produced — nothing new is fetched here,
 * and it is never persisted client-side.
 */

function isImage(mimeType: string | null): boolean {
  return !!mimeType && mimeType.startsWith("image/")
}

export function PayoutProofSheet({
  doc,
  children,
}: {
  doc: AdminPayoutProofDocument
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl"
      >
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
            {doc.documentName ?? doc.typeName}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {doc.typeName} · uploaded {new Date(doc.uploadedAt).toLocaleString()}
            {doc.fileSize ? ` · ${Math.round(doc.fileSize / 1024)} KB` : ""}
          </SheetDescription>
        </SheetHeader>

        {doc.instructions && (
          <p className="border-b border-border bg-muted/30 px-6 py-3 text-xs text-muted-foreground">
            {doc.instructions}
          </p>
        )}

        <div className="min-h-0 flex-1 bg-muted/20">
          {isImage(doc.mimeType) ? (
            <div className="h-full overflow-auto p-4">
              {/* Not next/image: the source is a short-lived signed R2 URL on a
                  host the optimizer isn't configured for, and it's a one-off
                  document view, not a rendered asset. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={doc.viewUrl}
                alt={doc.documentName ?? doc.typeName}
                className="mx-auto max-w-full rounded-md border border-border bg-card shadow-sm"
              />
            </div>
          ) : (
            <iframe
              src={doc.viewUrl}
              title={doc.documentName ?? doc.typeName}
              className="h-full w-full border-0"
            />
          )}
        </div>

        <div className="border-t border-border px-6 py-3">
          {/* Kept as an escape hatch — some browsers refuse to frame a PDF,
              and a reviewer must always be able to reach the document. */}
          <a
            href={doc.viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in a new tab instead
          </a>
        </div>
      </SheetContent>
    </Sheet>
  )
}
