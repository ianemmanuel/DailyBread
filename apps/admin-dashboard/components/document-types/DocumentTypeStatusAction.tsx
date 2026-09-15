"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Ban, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import type { DocumentTypeStatus } from "@/types/document-type.types"

interface Props {
  id    : string
  name  : string
  status: DocumentTypeStatus
}

/** Only toggles ACTIVE <-> INACTIVE — DEPRECATED/ARCHIVED aren't reachable here. */
export function DocumentTypeStatusAction({ id, name, status }: Props) {
  const router = useRouter()
  const isActive = status === "ACTIVE"
  const nextAction = isActive ? "deactivate" : "activate"

  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  async function submit() {
    setPending(true)
    try {
      const res = await fetch(`/api/document-types/${id}/${nextAction}`, { method: "PATCH" })
      const data = await res.json()
      if (res.ok) {
        toast.success(isActive ? "Document type deactivated" : "Document type activated", {
          description: isActive
            ? `${name} is no longer required during onboarding.`
            : `${name} is now required during onboarding again.`,
        })
        setOpen(false)
        router.refresh()
      } else {
        toast.error("Action failed", { description: data.message ?? "Something went wrong." })
      }
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={
          isActive
            ? "gap-1.5 rounded-full border-destructive/30 text-destructive hover:bg-destructive-bg"
            : "gap-1.5 rounded-full border-success/30 text-success hover:bg-success-bg"
        }
        onClick={() => setOpen(true)}
      >
        {isActive ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        {isActive ? "Deactivate" : "Activate"}
      </Button>

      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <div className={`icon-badge h-11 w-11 ${isActive ? "icon-badge-danger" : "icon-badge-success"}`}>
            {isActive ? <Ban className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <AlertDialogTitle>{isActive ? "Deactivate" : "Activate"} {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {isActive
              ? "Vendors won't be asked to upload this document during onboarding until it's reactivated."
              : "Vendors will be asked to upload this document during onboarding again."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={isActive ? "destructive" : "default"}
            className="rounded-full gap-1.5"
            disabled={pending}
            onClick={submit}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? "Saving…" : isActive ? "Confirm Deactivate" : "Confirm Activate"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
