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
import type { VendorTypeStatus } from "@/types/vendor-type.types"

interface Props {
  /** Slug — used both for the API call and cache-tag revalidation, matching the URL. */
  slug  : string
  name  : string
  status: VendorTypeStatus
}

/** Suspend/activate confirmation — a short, consequential toggle, so this stays an AlertDialog (unlike creation, which uses a Sheet). */
export function VendorCategoryStatusAction({ slug, name, status }: Props) {
  const router = useRouter()
  const isActive = status === "ACTIVE"
  const nextAction = isActive ? "deactivate" : "activate"

  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  async function submit() {
    setPending(true)
    try {
      const res = await fetch(`/api/vendor-types/${slug}/${nextAction}`, { method: "PATCH" })
      const data = await res.json()
      if (res.ok) {
        toast.success(isActive ? "Vendor category suspended" : "Vendor category activated", {
          description: isActive
            ? `${name} is now hidden from vendor onboarding. Existing vendors under this category are unaffected.`
            : `${name} is now available during vendor onboarding.`,
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
        {isActive ? "Suspend" : "Activate"}
      </Button>

      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <div className={`icon-badge h-11 w-11 ${isActive ? "icon-badge-danger" : "icon-badge-success"}`}>
            {isActive ? <Ban className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <AlertDialogTitle>{isActive ? "Suspend" : "Activate"} {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {isActive
              ? "Vendors won't be able to select this category during onboarding until it's reactivated. Existing vendors of this category are unaffected."
              : "This vendor category becomes available for vendors to select during onboarding again."}
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
            {pending ? "Saving…" : isActive ? "Confirm Suspend" : "Confirm Activate"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
