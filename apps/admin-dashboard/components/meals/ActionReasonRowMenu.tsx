"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal, Eye, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ReasonForm } from "@/components/meals/ReasonForm"
import type { MealReasonLibraryRow } from "@/types"

/*
 * The row's three-dot menu: View details, and Edit when the SERVER said this
 * admin may manage the reason (canManage). Edit opens the same sheet the
 * details page uses, controlled from here.
 */
export function ActionReasonRowMenu({ reason }: { reason: MealReasonLibraryRow }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${reason.label}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-44"
          style={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)" }}
        >
          <DropdownMenuItem onClick={() => router.push(`/meals/reasons/${reason.id}`)}>
            <Eye className="mr-2 h-4 w-4" />
            View details
          </DropdownMenuItem>
          {reason.canManage && (
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {reason.canManage && <ReasonForm mode="edit" reason={reason} open={editing} onOpenChange={setEditing} />}
    </>
  )
}
