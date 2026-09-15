"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Tag, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import { EmptyState } from "@/components/shared/EmptyState"
import type { DocumentTypeVendorTypeLink } from "@/types/document-type.types"
import type { VendorType } from "@/types/vendor-type.types"

interface Props {
  documentTypeId: string
  links         : DocumentTypeVendorTypeLink[]
  allVendorTypes: VendorType[]
  canWrite      : boolean
}

export function DocumentTypeVendorTypeManager({ documentTypeId, links, allVendorTypes, canWrite }: Props) {
  const router = useRouter()

  const linkedIds = useMemo(() => new Set(links.map((l) => l.vendorTypeId)), [links])
  const available  = useMemo(() => allVendorTypes.filter((v) => !linkedIds.has(v.id)), [allVendorTypes, linkedIds])

  const [addOpen, setAddOpen]           = useState(false)
  const [selectedId, setSelectedId]     = useState("")
  const [pendingId, setPendingId]       = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<DocumentTypeVendorTypeLink | null>(null)

  async function addLink() {
    if (!selectedId) return
    setPendingId("add")
    try {
      const res = await fetch(`/api/document-types/${documentTypeId}/vendor-types`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ vendorTypeId: selectedId, isRequired: true }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success("Requirement added")
        setAddOpen(false)
        setSelectedId("")
        router.refresh()
      } else {
        toast.error("Failed to add", { description: data.message ?? "Something went wrong." })
      }
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setPendingId(null)
    }
  }

  async function toggleRequired(link: DocumentTypeVendorTypeLink, isRequired: boolean) {
    setPendingId(link.id)
    try {
      const res = await fetch(`/api/document-types/requirements/${link.id}?documentTypeId=${documentTypeId}`, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ isRequired }),
      })
      const data = await res.json()
      if (res.ok) {
        router.refresh()
      } else {
        toast.error("Update failed", { description: data.message ?? "Something went wrong." })
      }
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setPendingId(null)
    }
  }

  async function remove() {
    if (!removeTarget) return
    setPendingId(removeTarget.id)
    try {
      const res = await fetch(`/api/document-types/requirements/${removeTarget.id}?documentTypeId=${documentTypeId}`, {
        method: "DELETE",
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success("Requirement removed")
        setRemoveTarget(null)
        router.refresh()
      } else {
        toast.error("Removal failed", { description: data.message ?? "Something went wrong." })
      }
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="admin-card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Required For Vendor Types</h2>
          <p className="text-xs text-muted-foreground">Which vendor types must upload this document to onboard.</p>
        </div>
        {canWrite && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-full"
            disabled={available.length === 0}
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        )}
      </div>

      {links.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Applies to no vendor types yet"
          description="Without a link, this document type won't appear in any vendor's onboarding checklist."
        />
      ) : (
        <ul className="divide-y divide-border/60">
          {links.map((link) => (
            <li key={link.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="icon-badge icon-badge-primary h-8 w-8">
                  <Tag className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm font-medium text-foreground">{link.vendorType.name}</p>
              </div>
              <div className="flex items-center gap-3">
                {canWrite ? (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Required
                    <Switch
                      checked={link.isRequired}
                      disabled={pendingId === link.id}
                      onCheckedChange={(c) => toggleRequired(link, c)}
                    />
                  </label>
                ) : (
                  <span className="text-xs text-muted-foreground">{link.isRequired ? "Required" : "Optional"}</span>
                )}
                {canWrite && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-muted-foreground hover:text-destructive"
                    onClick={() => setRemoveTarget(link)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add dialog */}
      <AlertDialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setSelectedId("") }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-primary h-11 w-11">
              <Tag className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Add a vendor type requirement</AlertDialogTitle>
            <AlertDialogDescription>
              Vendors of the selected type will need to upload this document to complete onboarding.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label className="text-xs">Vendor type</Label>
            <Select value={selectedId || undefined} onValueChange={setSelectedId}>
              <SelectTrigger className="w-full rounded-xl text-sm" style={{ backgroundColor: "var(--input)", color: "var(--foreground)" }}>
                <SelectValue placeholder="Select a vendor type…" />
              </SelectTrigger>
              <SelectContent className="rounded-xl" style={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)" }}>
                {available.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="rounded-lg">{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setAddOpen(false)} disabled={pendingId !== null}>
              Cancel
            </Button>
            <Button type="button" className="rounded-full gap-1.5" disabled={pendingId !== null || !selectedId} onClick={addLink}>
              {pendingId === "add" && <Loader2 className="h-4 w-4 animate-spin" />}
              {pendingId === "add" ? "Adding…" : "Confirm Add"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-danger h-11 w-11">
              <X className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Remove requirement for {removeTarget?.vendorType.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This document will no longer appear in that vendor type&apos;s onboarding checklist.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setRemoveTarget(null)} disabled={pendingId !== null}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" className="rounded-full gap-1.5" disabled={pendingId !== null} onClick={remove}>
              {pendingId === removeTarget?.id && <Loader2 className="h-4 w-4 animate-spin" />}
              {pendingId === removeTarget?.id ? "Removing…" : "Confirm Remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
