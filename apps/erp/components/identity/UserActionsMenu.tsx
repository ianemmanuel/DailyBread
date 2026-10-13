"use client"

import Link from "next/link"
import { Eye, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { detailHref } from "@/lib/identity/format"

/*
 * The row menu only navigates. Suspension, deactivation and every other
 * account action live on the details page, where the server's per-account
 * capabilities decide what is offered and each action is confirmed.
 */
export function UserActionsMenu({ userId, displayName }: { userId: string; displayName: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${displayName}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44"
        style={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)" }}
      >
        <DropdownMenuItem asChild>
          <Link href={detailHref(userId)}><Eye className="mr-2 h-4 w-4" />View details</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
