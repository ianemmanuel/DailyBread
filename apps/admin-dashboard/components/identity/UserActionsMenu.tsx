"use client"

import { useState } from "react"
import { useRouter }          from "next/navigation"
import { MoreHorizontal, Mail, Eye, Ban, RefreshCw, UserX, Loader2 } from "lucide-react"
import { Button }             from "@/components/ui/button"
import { Textarea }           from "@/components/ui/textarea"
import { Label }              from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"

interface User {
  id          : string
  status      : string
  displayName : string
}

interface Props {
  user          : User
  canInvite     : boolean
  canSuspend    : boolean
  canReinstate  : boolean
  canDeactivate : boolean
}

type Dialog = "suspend" | "deactivate" | null

/**
 * UserActionsMenu — dropdown for the user table row.
 * Routes to /identity/:id/review for pending/invited users.
 * Routes to /identity/:id for active/suspended users.
 */
export function UserActionsMenu({ user, canInvite, canSuspend, canReinstate, canDeactivate }: Props) {
  const router = useRouter()
  const [openDialog, setOpenDialog] = useState<Dialog>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [reason,  setReason]  = useState("")
  const [error,   setError]   = useState<string | null>(null)

  function closeDialog() {
    setOpenDialog(null)
    setReason("")
    setError(null)
  }

  async function doAction(endpoint: string, body?: object) {
    setError(null)
    setPending(endpoint)
    const res = await fetch(`/api/identity/users/${user.id}/${endpoint}`, {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : body ? JSON.stringify(body) : undefined,
    })
    if (res.ok) {
      closeDialog()
      router.refresh()
    } else {
      const data = await res.json()
      const msg = data.message ?? "Please try again."
      setError(msg)
      toast.error("Action failed", { description: msg })
    }
    setPending(null)
  }

  const detailHref = (user.status === "pending" || user.status === "invited")
    ? `/identity/manage/${user.id}/review`
    : `/identity/manage/${user.id}`

  const canDeactivateNow = canDeactivate && user.status !== "deactivated"

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${user.displayName}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-48"
          style={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)" }}
        >
          <DropdownMenuItem onClick={() => router.push(detailHref)}>
            <Eye className="mr-2 h-4 w-4" />
            {user.status === "pending" || user.status === "invited" ? "Review" : "View details"}
          </DropdownMenuItem>

          {canInvite && (user.status === "pending" || user.status === "invited") && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => doAction("invite")}>
                <Mail className="mr-2 h-4 w-4" />
                {user.status === "invited" ? "Resend invite" : "Send invite"}
              </DropdownMenuItem>
            </>
          )}

          {(canSuspend || canReinstate || canDeactivateNow) && <DropdownMenuSeparator />}

          {canSuspend && user.status === "active" && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setOpenDialog("suspend")}
            >
              <Ban className="mr-2 h-4 w-4" />
              Suspend
            </DropdownMenuItem>
          )}

          {canReinstate && user.status === "suspended" && (
            <DropdownMenuItem onClick={() => doAction("reinstate")}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reinstate
            </DropdownMenuItem>
          )}

          {canDeactivateNow && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setOpenDialog("deactivate")}
            >
              <UserX className="mr-2 h-4 w-4" />
              Deactivate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Suspend confirmation + reason */}
      <AlertDialog open={openDialog === "suspend"} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-danger h-11 w-11">
              <Ban className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Suspend {user.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will immediately lose access to the platform. Their record and history are kept — you can reinstate them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="suspend-reason-menu">Reason *</Label>
            <Textarea
              id="suspend-reason-menu"
              placeholder="Why is this admin being suspended?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-20 text-sm"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={closeDialog} disabled={pending !== null}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-full gap-1.5"
              disabled={pending !== null || reason.trim().length < 5}
              onClick={() => doAction("suspend", { reason: reason.trim() })}
            >
              {pending === "suspend" && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending === "suspend" ? "Suspending…" : "Confirm Suspend"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivate confirmation + reason */}
      <AlertDialog open={openDialog === "deactivate"} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-danger h-11 w-11">
              <UserX className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Deactivate {user.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Use this when the admin has left the company. Their Clerk account is deleted immediately so they can't sign in,
              but their record and history stay with the company. If they return, they'll need a new invitation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="deactivate-reason-menu">Reason *</Label>
            <Textarea
              id="deactivate-reason-menu"
              placeholder="e.g. Employee offboarded on 2026-08-20"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-20 text-sm"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={closeDialog} disabled={pending !== null}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-full gap-1.5"
              disabled={pending !== null || reason.trim().length < 5}
              onClick={() => doAction("deactivate", { reason: reason.trim() })}
            >
              {pending === "deactivate" && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending === "deactivate" ? "Deactivating…" : "Confirm Deactivate"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
