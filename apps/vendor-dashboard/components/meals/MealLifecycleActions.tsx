"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Archive, ArchiveRestore, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ClientApiError } from "@/lib/api/client"
import { FormSection } from "@/components/dashboard/form"
import { useDeleteMenuItem, useSetMenuItemArchived, type MenuItem } from "@/lib/queries/menu"

/*
 * Taking a dish off the menu — the two vendor verbs, and the difference
 * between them said in words:
 *
 *   Archive  stops it selling everywhere and keeps it here, with every
 *            location, price and option, to bring back in one tap.
 *   Delete   takes it off this menu as well. Its name is free to use again.
 *
 * Neither is a moderation action. A dish DailyBread has removed cannot be
 * archived or deleted by the vendor (the backend refuses it, as it refuses an
 * edit), so the card is not offered for one.
 */
export function MealLifecycleActions({ item }: { item: MenuItem }) {
  const router = useRouter()
  const setArchived = useSetMenuItemArchived(item.id)
  const deleteItem  = useDeleteMenuItem(item.id)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [pending, setPending] = React.useState<"archive" | "delete" | null>(null)

  if (item.adminStatus === "BANNED") return null

  async function toggleArchived() {
    const next = !item.isArchived
    setPending("archive")
    try {
      await setArchived.mutateAsync(next)
      toast.success(next ? "Archived — it's off your menu for customers" : "Restored to your menu")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Something went wrong")
    } finally {
      setPending(null)
    }
  }

  async function remove() {
    setPending("delete")
    try {
      await deleteItem.mutateAsync()
      toast.success(`Deleted “${item.name}”`)
      router.push("/meals")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Something went wrong")
      setPending(null)
    }
  }

  return (
    <FormSection
      icon={Archive}
      title="Take off the menu"
      description={
        item.isArchived
          ? "Archived: customers can't see or order this dish anywhere. Restore it to sell it again, exactly as it was."
          : "Archive to stop selling it everywhere and keep it here to bring back. Delete to remove it from your menu."
      }
    >
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="gap-1.5 rounded-full"
          onClick={toggleArchived}
          disabled={pending !== null}
        >
          {pending === "archive"
            ? <Loader2 className="size-4 animate-spin" />
            : item.isArchived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
          {item.isArchived ? "Restore to menu" : "Archive"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="gap-1.5 rounded-full text-[var(--destructive)] hover:text-[var(--destructive)]"
          onClick={() => setConfirmDelete(true)}
          disabled={pending !== null}
        >
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={(next) => !next && pending === null && setConfirmDelete(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{item.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It comes off your menu and customers can no longer order it anywhere. You can't bring it
              back from here — if you might sell it again, archive it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); remove() }}
              disabled={pending !== null}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending === "delete" && <Loader2 className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormSection>
  )
}
