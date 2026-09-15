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
  code    : string
  name    : string
  isActive: boolean
}

/**
 * Deactivating the global catalog entry stops it being offerable in any
 * NEW country config — existing CountryPaymentMethod rows already
 * configured against it are untouched (see setPaymentMethodActive's
 * comment) — deactivating those is a separate, explicit action on
 * /countries/[slug]/payment-methods.
 */
export function PaymentMethodActiveToggle({ code, name, isActive }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  async function submit() {
    setPending(true)
    try {
      const res = await fetch(`/api/payment-methods/${code}/active`, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ isActive: !isActive }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(isActive ? "Payment method deactivated" : "Payment method reactivated")
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
        type="button" variant="outline" size="sm"
        className={isActive ? "gap-1.5 rounded-full border-destructive/30 text-destructive hover:bg-destructive-bg" : "gap-1.5 rounded-full border-success/30 text-success hover:bg-success-bg"}
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
              ? "It won't be selectable for any new country configuration until reactivated. Countries that already configured it are unaffected."
              : "It becomes selectable again for new country configuration."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button type="button" variant={isActive ? "destructive" : "default"} className="rounded-full gap-1.5" disabled={pending} onClick={submit}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? "Saving…" : isActive ? "Confirm Deactivate" : "Confirm Reactivate"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
