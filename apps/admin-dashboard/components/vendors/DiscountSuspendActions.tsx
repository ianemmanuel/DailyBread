"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Ban, Undo2 } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { Textarea } from "@repo/ui/components/textarea"
import { Label } from "@repo/ui/components/label"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog"

/*
 * Oversight, not authoring.
 *
 * Merchants self-serve their own promotions — Uber Eats, DoorDash and Bolt Food
 * all launch a merchant offer with no approval queue — so the only admin action
 * here is a stop button. The reason is required because the vendor is shown it
 * verbatim, and "your promotion was stopped" with no explanation is a support
 * ticket by construction.
 */

interface Props {
  discountId : string
  name       : string
  isSuspended: boolean
}

export function DiscountSuspendActions({ discountId, name, isSuspended }: Props) {
  const router = useRouter()
  const [reason, setReason] = React.useState("")
  const [pending, setPending] = React.useState(false)

  async function act(method: "POST" | "DELETE") {
    if (method === "POST" && !reason.trim()) {
      toast.error("Say why this offer is being stopped.")
      return
    }
    setPending(true)
    try {
      const res = await fetch(`/api/vendors/discounts/${discountId}/suspend`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify({ reason: reason.trim() }) } : {}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? "Something went wrong")

      toast.success(method === "POST" ? `"${name}" stopped` : `"${name}" released`)
      setReason("")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setPending(false)
    }
  }

  if (isSuspended) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => act("DELETE")}
        disabled={pending}
        className="cursor-pointer gap-1.5 transition-transform hover:scale-105"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
        Release this offer
      </Button>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {/*
          * Red with white text, and it lifts slightly on hover.
          *
          * Stopping someone else's promotion is destructive and irreversible
          * without a second admin action, so it should not look like the ghost
          * buttons around it. The lift is a hover affordance, not decoration —
          * it is what tells you the thing under the cursor is the button.
          */}
        <Button
          size="sm"
          disabled={pending}
          className="cursor-pointer gap-1.5 bg-destructive text-white transition-transform hover:scale-105 hover:bg-destructive/90"
        >
          <Ban className="size-4" />
          Stop this offer
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            It stops immediately and the vendor cannot edit or resume it. They will see your reason
            word for word, so write it for them.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs">Reason <span className="text-destructive">*</span></Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What's wrong with this offer, and what would fix it."
            className="min-h-20 text-sm"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} className="cursor-pointer">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => act("POST")}
            disabled={pending}
            className="cursor-pointer bg-destructive text-white hover:bg-destructive/90"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Stop this offer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
