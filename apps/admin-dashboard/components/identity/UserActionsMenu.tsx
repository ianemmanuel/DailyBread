"use client"

import { useRouter }          from "next/navigation"
import { MoreHorizontal, Mail, Eye, Ban, RefreshCw } from "lucide-react"
import { Button }             from "@repo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu"
import { toast } from "sonner"

interface User {
  id          : string
  status      : string
  displayName : string
}

interface Props {
  user      : User
  canInvite : boolean
  canManage : boolean
}

/**
 * UserActionsMenu — dropdown for the user table row.
 * Routes to /identity/:id/review for pending/invited users.
 * Routes to /identity/:id for active/suspended users.
 */
export function UserActionsMenu({ user, canInvite, canManage }: Props) {
  const router = useRouter()

  async function doAction(endpoint: string, body?: object) {
    const res = await fetch(`/api/admin/identity/users/${user.id}/${endpoint}`, {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : body ? JSON.stringify(body) : undefined,
    })
    if (res.ok) {
      router.refresh()
    } else {
      const data = await res.json()
      toast.error("Action failed", { description: data.message ?? "Please try again." })
    }
  }

  const detailHref = (user.status === "pending" || user.status === "invited")
    ? `/identity/${user.id}/review`
    : `/identity/${user.id}`

  return (
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

        {canManage && (
          <>
            <DropdownMenuSeparator />
            {user.status === "active" && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  const reason = window.prompt(`Reason for suspending ${user.displayName}:`)
                  if (reason?.trim()) doAction("suspend", { reason })
                }}
              >
                <Ban className="mr-2 h-4 w-4" />
                Suspend
              </DropdownMenuItem>
            )}
            {user.status === "suspended" && (
              <DropdownMenuItem onClick={() => doAction("reinstate")}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reinstate
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}