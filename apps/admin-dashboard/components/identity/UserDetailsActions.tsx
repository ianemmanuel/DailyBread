"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Mail } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"

interface Props {
  userId     : string
  userStatus : string
  canInvite  : boolean
  canManage  : boolean
}

/**
 * UserDetailActions — lifecycle action buttons on the user detail page.
 * Client component: handles optimistic state and loading feedback.
 * Posts to /api/admin/identity/users/[id]/[action] route handler.
 */
export function UserDetailActions({ userId, userStatus, canInvite, canManage }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [reason, setReason]  = useState("")
  const [error,  setError] = useState<string | null>(null)

  async function doAction(action: string, body?: object) {
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/admin/identity/users/${userId}/${action}`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : body ? JSON.stringify(body) : undefined,
      })
      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json()
        setError(data.message ?? `Failed to ${action} user.`)
      }
    })
  }

  if (!canInvite && !canManage) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && (
        <p className="w-full text-xs text-destructive">{error}</p>
      )}

      {canInvite && (userStatus === "pending" || userStatus === "invited") && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => doAction("invite")}
        >
          <Mail className="mr-2 h-4 w-4" />
          {userStatus === "invited" ? "Resend Invite" : "Send Invite"}
        </Button>
      )}

      {canManage && userStatus === "active" && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="Suspension reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-9 w-52 text-sm"
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending || !reason.trim()}
            onClick={() => doAction("suspend", { reason })}
          >
            Suspend
          </Button>
        </div>
      )}

      {canManage && userStatus === "suspended" && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => doAction("reinstate")}
        >
          Reinstate
        </Button>
      )}
    </div>
  )
}