"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { UserCheck, UserX, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"

interface Props {
  userId          : string
  availability    : string
  unavailableFrom?: string | null
  unavailableUntil?: string | null
  unavailableReason?: string | null
}

const todayISO = () => new Date().toISOString().slice(0, 10)

/**
 * SetAvailabilityForm — Identity & Access-managed review-workload
 * availability (see AvailabilityBadge). Distinct from account status:
 * an active admin marked UNAVAILABLE stops receiving work reassignment
 * without losing platform access. Follows the same AlertDialog pattern
 * as UserDetailActions' Suspend/Deactivate dialogs.
 */
export function SetAvailabilityForm({ userId, availability, unavailableFrom, unavailableUntil, unavailableReason }: Props) {
  const router = useRouter()
  const isUnavailable = availability === "UNAVAILABLE"

  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(unavailableFrom?.slice(0, 10) || todayISO())
  const [until, setUntil] = useState(unavailableUntil?.slice(0, 10) || "")
  const [reason, setReason] = useState(unavailableReason ?? "")

  function closeDialog() {
    setOpen(false)
    setError(null)
  }

  async function submit(nextAvailability: "AVAILABLE" | "UNAVAILABLE") {
    setError(null)
    setPending(true)
    try {
      const res = await fetch(`/api/identity/users/${userId}/availability`, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          nextAvailability === "AVAILABLE"
            ? { availability: "AVAILABLE" }
            : {
                availability: "UNAVAILABLE",
                unavailableFrom : from  ? new Date(from).toISOString()  : undefined,
                unavailableUntil: until ? new Date(until).toISOString() : undefined,
                unavailableReason: reason.trim() || undefined,
              },
        ),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(nextAvailability === "AVAILABLE" ? "Marked available" : "Marked unavailable")
        setOpen(false)
        router.refresh()
      } else {
        setError(data.message ?? "Failed to update availability.")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setPending(false)
    }
  }

  if (isUnavailable) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5 rounded-full"
        disabled={pending}
        onClick={() => submit("AVAILABLE")}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
        Mark Available
      </Button>
    )
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="gap-1.5 rounded-full" onClick={() => setOpen(true)}>
        <UserX className="h-4 w-4" />
        Mark Unavailable
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-warning h-11 w-11">
              <UserX className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Mark this admin unavailable?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll keep platform access but stop receiving new work reassignments until marked available again.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="unavailable-from">From</Label>
              <Input id="unavailable-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="unavailable-until">Until (optional)</Label>
              <Input id="unavailable-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} min={from} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="unavailable-reason">Reason (optional)</Label>
            <Textarea
              id="unavailable-reason"
              placeholder="e.g. Annual leave, out sick, training"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-16 text-sm"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={closeDialog} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-full gap-1.5"
              disabled={pending}
              onClick={() => submit("UNAVAILABLE")}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? "Saving…" : "Confirm"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
