"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, ThumbsUp, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import type { AdminModifierGroup } from "@/types"

/*
 * The verdict on ONE option group, shown inside its card on the meal page.
 *
 * A group's wording lives on the group and the group can sit on many dishes,
 * so its verdict is its own: approving it clears every dish it was holding
 * back, and sending it back holds them all until the vendor edits it — at
 * which point each one returns to the meal queue by itself. The card says how
 * many dishes that is (usedByCount) before the admin decides.
 */

interface Props {
  group: AdminModifierGroup
}

export function ModifierGroupModerationActions({ group }: Props) {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [reason, setReason]   = useState("")
  const [pending, setPending] = useState(false)

  const base     = `/api/vendors/meals/modifier-groups/${group.id}`
  const approved = group.reviewStatus === "MANUALLY_APPROVED"
  const sentBack = group.reviewStatus === "MANUALLY_REJECTED"
  const dishes   = group.usedByCount === 1 ? "this meal" : `all ${group.usedByCount} meals using it`

  async function run(op: "approve" | "send-back", body: unknown, success: string) {
    setPending(true)
    const res  = await fetch(`${base}/${op}`, {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify(body ?? {}),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { toast.success(success); setOpen(false); router.refresh() }
    else toast.error(data.message ?? "Something went wrong")
    setPending(false)
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
      <Button
        type="button"
        size="sm"
        variant="success"
        className="gap-1.5 rounded-full"
        disabled={pending || approved}
        onClick={() => run("approve", undefined, "Options approved")}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
        {approved ? "Options approved" : "Approve options"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5 rounded-full"
        disabled={pending || sentBack}
        onClick={() => { setReason(""); setOpen(true) }}
      >
        <Undo2 className="h-3.5 w-3.5" />
        {sentBack ? "Awaiting the vendor" : "Send back"}
      </Button>
      <span className="text-xs text-muted-foreground">Applies to {dishes}.</span>

      <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Send “{group.name}” back for revision</AlertDialogTitle>
            <AlertDialogDescription>
              Holds {dishes} off the menu until the vendor rewrites these options. They are notified with
              exactly the message below; once they edit the group, each meal returns to review on its own.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">What the vendor needs to change *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-24 text-sm"
              placeholder="Which option, what is wrong with it, and what would be acceptable…"
            />
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-1.5 rounded-full"
              disabled={pending || !reason.trim()}
              onClick={() => run("send-back", { reason: reason.trim() }, "Options sent back to the vendor")}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send back
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
