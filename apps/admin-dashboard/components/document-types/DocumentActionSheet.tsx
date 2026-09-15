"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Loader2, Settings2, ArrowLeftRight, Ban, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet"
import { scopeLabel } from "./ActiveDocumentsTable"
import type { DocumentTypeConfig } from "@/types/document-type.types"

interface Props {
  documentType: DocumentTypeConfig
  countryId   : string
  countrySlug : string
}

/**
 * One sheet, three independent actions — toggle mandatory/optional, toggle
 * vendor/outlet scope, deactivate with a required reason. Used on every
 * /countries/[slug]/documents/* subpage row.
 */
export function DocumentActionSheet({ documentType, countryId, countrySlug }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState<"requirement" | "scope" | "deactivate" | null>(null)

  async function toggleRequired() {
    setBusy("requirement")
    try {
      const res = await fetch(`/api/document-types/${documentType.id}?countryRef=${countryId}`, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ isRequired: !documentType.isRequired }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(documentType.isRequired ? "Marked optional" : "Marked mandatory")
        setOpen(false)
        router.refresh()
      } else {
        toast.error("Update failed", { description: data.message ?? "Something went wrong." })
      }
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setBusy(null)
    }
  }

  async function toggleScope() {
    setBusy("scope")
    const nextScope = documentType.scope === "VENDOR" ? "OUTLET" : "VENDOR"
    try {
      const res = await fetch(`/api/document-types/${documentType.id}/scope?countryRef=${countryId}`, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ scope: nextScope }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Scope changed to ${nextScope === "VENDOR" ? "vendor" : "outlet"}`)
        setOpen(false)
        router.refresh()
      } else {
        toast.error("Update failed", { description: data.message ?? "Something went wrong." })
      }
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setBusy(null)
    }
  }

  async function deactivate() {
    if (!reason.trim()) {
      toast.error("A reason is required to deactivate a document")
      return
    }
    setBusy("deactivate")
    try {
      const res = await fetch(`/api/document-types/${documentType.id}/deactivate?countryRef=${countryId}`, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ reason }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success("Document deactivated")
        setOpen(false)
        setReason("")
        router.refresh()
      } else {
        toast.error("Deactivation failed", { description: data.message ?? "Something went wrong." })
      }
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setReason("") }}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full">
          <Settings2 className="h-3.5 w-3.5" />
          Actions
        </Button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{documentType.name}</SheetTitle>
          <SheetDescription>Manage how this document behaves for vendors in this country.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div className="space-y-2 rounded-xl border border-border/60 p-3">
            <p className="text-sm font-medium text-foreground">
              Currently {documentType.isRequired ? "mandatory" : "optional"}
            </p>
            <p className="text-xs text-muted-foreground">
              {documentType.isRequired
                ? "Vendors must upload this document to complete onboarding."
                : "Vendors may skip this document and still complete onboarding."}
            </p>
            <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" disabled={busy !== null} onClick={toggleRequired}>
              {busy === "requirement" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Switch to {documentType.isRequired ? "optional" : "mandatory"}
            </Button>
          </div>

          <div className="space-y-2 rounded-xl border border-border/60 p-3">
            <p className="text-sm font-medium text-foreground">
              Currently scoped to {scopeLabel(documentType)}
            </p>
            <p className="text-xs text-muted-foreground">
              {documentType.scope === "VENDOR" && "Required once per vendor account."}
              {documentType.scope === "OUTLET" && "Required separately for each outlet, nationwide."}
              {documentType.scope === "CITY" && "Required once per vendor per city, inherited by their outlets there."}
            </p>
            {documentType.scope === "CITY" ? (
              <Button asChild type="button" variant="outline" size="sm" className="gap-1.5 rounded-full">
                <Link href={`/countries/${countrySlug}/documents/${documentType.id}`}>
                  <Pencil className="h-3.5 w-3.5" />
                  Change scope or city from the document's page
                </Link>
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" disabled={busy !== null} onClick={toggleScope}>
                {busy === "scope" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Switch to {documentType.scope === "VENDOR" ? "outlet" : "vendor"} scope
              </Button>
            )}
          </div>

          <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-foreground">Deactivate this document</p>
            <p className="text-xs text-muted-foreground">
              Vendors will no longer be asked to upload it. A reason is required and kept on record.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="deactivate-reason">Reason *</Label>
              <Textarea
                id="deactivate-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Superseded by a new licensing requirement"
                className="min-h-16 text-sm"
              />
            </div>
            <Button type="button" variant="destructive" size="sm" className="gap-1.5 rounded-full" disabled={busy !== null || !reason.trim()} onClick={deactivate}>
              {busy === "deactivate" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Ban className="h-3.5 w-3.5" />
              Deactivate
            </Button>
          </div>
        </div>

        <SheetFooter className="border-t border-border">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
