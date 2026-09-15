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

interface Props {
  code: string
  name: string
  status: "ACTIVE" | "INACTIVE"
}

/**
 * Deactivating a provider catalog entry stops it being selectable for any
 * NEW country wiring. It is never hard-deleted — historical financial
 * records will point at it.
 */
export function PaymentProviderStatusToggle({ code, name, status }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const isActive = status === "ACTIVE"

  async function submit() {
    setPending(true)
    try {
      const res = await fetch(`/api/finance/providers/${code}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: isActive ? "INACTIVE" : "ACTIVE" }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(isActive ? "Provider deactivated" : "Provider reactivated")
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
        {isActive ? "Deactivate" : "Reactivate"}
      </Button>

      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <div className={`icon-badge h-11 w-11 ${isActive ? "icon-badge-danger" : "icon-badge-success"}`}>
            {isActive ? <Ban className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <AlertDialogTitle>{isActive ? "Deactivate" : "Reactivate"} {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {isActive
              ? "It won't be selectable for any new country wiring until reactivated. Existing wiring is unaffected."
              : "It becomes selectable again for new country wiring."}
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
            {pending ? "Saving…" : isActive ? "Confirm Deactivate" : "Confirm Reactivate"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
