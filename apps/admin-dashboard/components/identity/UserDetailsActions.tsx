"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Mail, Ban, RefreshCw, UserX, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
  userId        : string
  userStatus    : string
  canInvite     : boolean
  canSuspend    : boolean
  canReinstate  : boolean
  canDeactivate : boolean
}

type Dialog = "suspend" | "deactivate" | null

/**
 * UserDetailActions — lifecycle action buttons on the user detail page.
 * Client component: handles optimistic state and loading feedback.
 * Posts to /api/identity/users/[id]/[action] route handler.
 */
export function UserDetailActions({ userId, userStatus, canInvite, canSuspend, canReinstate, canDeactivate }: Props) {
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

  async function doAction(action: string, body?: object) {
    setError(null)
    setPending(action)
    try {
      const res = await fetch(`/api/identity/users/${userId}/${action}`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : body ? JSON.stringify(body) : undefined,
      })
      if (res.ok) {
        toast.success(
          action === "invite" ? (userStatus === "invited" ? "Invitation resent" : "Invitation sent")
          : action === "suspend" ? "User suspended"
          : action === "reinstate" ? "User reinstated"
          : "User deactivated",
        )
        closeDialog()
        router.refresh()
      } else {
        const data = await res.json()
        const msg = data.message ?? `Failed to ${action} user.`
        setError(msg)
        toast.error("Action failed", { description: msg })
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setPending(null)
    }
  }

  if (!canInvite && !canSuspend && !canReinstate && !canDeactivate) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canInvite && (userStatus === "pending" || userStatus === "invited") && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 rounded-full"
          disabled={pending !== null}
          onClick={() => doAction("invite")}
        >
          {pending === "invite" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {userStatus === "invited" ? "Resend Invite" : "Send Invite"}
        </Button>
      )}

      {canSuspend && userStatus === "active" && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 rounded-full border-destructive/30 text-destructive hover:bg-destructive-bg"
          onClick={() => setOpenDialog("suspend")}
        >
          <Ban className="h-4 w-4" />
          Suspend
        </Button>
      )}

      {canReinstate && userStatus === "suspended" && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 rounded-full"
          disabled={pending !== null}
          onClick={() => doAction("reinstate")}
        >
          {pending === "reinstate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Reinstate
        </Button>
      )}

      {canDeactivate && (userStatus === "active" || userStatus === "suspended" || userStatus === "invited" || userStatus === "pending") && (
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 rounded-full text-muted-foreground hover:text-destructive"
          onClick={() => setOpenDialog("deactivate")}
        >
          <UserX className="h-4 w-4" />
          Deactivate
        </Button>
      )}

      {/* Suspend confirmation + reason */}
      <AlertDialog open={openDialog === "suspend"} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-danger h-11 w-11">
              <Ban className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Suspend this admin?</AlertDialogTitle>
            <AlertDialogDescription>
              They will immediately lose access to the platform. Their record and history are kept — you can reinstate them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="suspend-reason">Reason *</Label>
            <Textarea
              id="suspend-reason"
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
            <AlertDialogTitle>Deactivate this admin?</AlertDialogTitle>
            <AlertDialogDescription>
              Use this when the admin has left the company. Their Clerk account is deleted immediately so they can't sign in,
              but their record and history stay with the company. If they return, they'll need a new invitation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="deactivate-reason">Reason *</Label>
            <Textarea
              id="deactivate-reason"
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
    </div>
  )
}
