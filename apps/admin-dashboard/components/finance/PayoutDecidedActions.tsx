"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, PowerOff, Flag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog"

/*
 * What an admin can do once a payout account's verification is final.
 *
 * Reject is deliberately not one of them: it writes verificationStatus FAILED,
 * which would claim a completed verification never succeeded and leave a
 * timeline that contradicts itself. The two things actually needed at this
 * point are different in kind, so they are different buttons:
 *
 *   Deactivate — take the account out of service. Operational and immediate;
 *                the vendor stops being paid to it.
 *   Flag       — get a second opinion from a senior in-country finance admin
 *                without touching the vendor's ability to be paid.
 */

type Op = "deactivate" | "flag"

interface Props {
  accountId : string
  identifier: string
  vendorName: string
  /** Already deactivated accounts only offer the flag. */
  isActive  : boolean
  canManage : boolean
}

const COPY: Record<Op, {
  label      : string
  title      : string
  description: (identifier: string, vendorName: string) => string
  placeholder: string
  confirm    : string
  success    : string
  destructive: boolean
}> = {
  deactivate: {
    label      : "Deactivate",
    title      : "Deactivate payout account",
    description: (identifier, vendorName) =>
      `${identifier} stops being a payout destination immediately and loses its default flag, so ${vendorName} will be prompted to choose another. The verification itself stays on the record — this is not a rejection.`,
    placeholder: "Why this account is being taken out of service…",
    confirm    : "Deactivate account",
    success    : "Payout account deactivated",
    destructive: true,
  },
  flag: {
    label      : "Flag for review",
    title      : "Flag for senior review",
    description: (identifier, vendorName) =>
      `Senior finance admins in ${vendorName}'s country are notified to take another look at ${identifier}. Nothing changes about the account — it stays verified and payable until someone decides otherwise.`,
    placeholder: "What concerns you about this account…",
    confirm    : "Send for review",
    success    : "Flagged for senior review",
    destructive: false,
  },
}

export function PayoutDecidedActions({ accountId, identifier, vendorName, isActive, canManage }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState<Op | null>(null)
  const [pending, setPending] = useState<Op | null>(null)
  const [reason, setReason] = useState("")

  if (!canManage) return null

  async function run(op: Op) {
    setPending(op)
    try {
      const res = await fetch(`/api/finance/payout-accounts/${accountId}/${op}`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ reason: reason.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(COPY[op].success)
        setOpen(null)
        router.refresh()
      } else {
        toast.error(data.message ?? "Action failed")
      }
    } catch {
      toast.error("Network error")
    } finally {
      setPending(null)
    }
  }

  function start(op: Op) {
    setReason("")
    setOpen(op)
  }

  const active = open ? COPY[open] : null

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {isActive && (
        <Button
          type="button" variant="outline"
          className="gap-1.5 rounded-full text-destructive hover:bg-destructive-bg"
          disabled={pending !== null} onClick={() => start("deactivate")}
        >
          <PowerOff className="h-3.5 w-3.5" />
          Deactivate
        </Button>
      )}
      <Button
        type="button" variant="outline" className="gap-1.5 rounded-full"
        disabled={pending !== null} onClick={() => start("flag")}
      >
        <Flag className="h-3.5 w-3.5" />
        Flag for review
      </Button>

      <AlertDialog open={open !== null} onOpenChange={(o) => !pending && !o && setOpen(null)}>
        <AlertDialogContent className="rounded-2xl">
          {active && (
            <>
              <AlertDialogHeader>
                <div className={`icon-badge h-11 w-11 ${active.destructive ? "icon-badge-danger" : "icon-badge-warning"}`}>
                  {open === "deactivate" ? <PowerOff className="h-5 w-5" /> : <Flag className="h-5 w-5" />}
                </div>
                <AlertDialogTitle>{active.title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {active.description(identifier, vendorName)}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1.5">
                <Label className="text-xs">Reason *</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={active.placeholder}
                  className="min-h-20 text-sm"
                />
              </div>
              <AlertDialogFooter>
                <Button
                  type="button" variant="outline" className="rounded-full"
                  disabled={pending !== null} onClick={() => setOpen(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant={active.destructive ? "destructive" : "default"}
                  className="gap-1.5 rounded-full"
                  disabled={pending !== null || !reason.trim()}
                  onClick={() => open && run(open)}
                >
                  {pending !== null && <Loader2 className="h-4 w-4 animate-spin" />}
                  {active.confirm}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
