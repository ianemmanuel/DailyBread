"use client"

import { useRouter } from "next/navigation"
import { MoreHorizontal, Mail, Eye, Ban, RefreshCw } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu"

interface User {
  id      : string
  status  : string
  fullName: string
}

interface Props {
  user      : User
  canInvite : boolean
  canManage : boolean
}

/**
 * UserActionsMenu — dropdown for the user table row.
 * Each action re-validates via router.refresh() after completion.
 */
export function UserActionsMenu({ user, canInvite, canManage }: Props) {
  const router = useRouter()

  async function doAction(endpoint: string, body?: object) {
    await fetch(`/api/admin/users/${user.id}/${endpoint}`, {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : body ? JSON.stringify(body) : undefined,
    })
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${user.fullName}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => router.push(`/identity/${user.id}`)}>
          <Eye className="mr-2 h-4 w-4" /> View details
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
                  const reason = window.prompt("Reason for suspension:")
                  if (reason) doAction("suspend", { reason })
                }}
              >
                <Ban className="mr-2 h-4 w-4" /> Suspend
              </DropdownMenuItem>
            )}
            {user.status === "suspended" && (
              <DropdownMenuItem onClick={() => doAction("reinstate")}>
                <RefreshCw className="mr-2 h-4 w-4" /> Reinstate
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}