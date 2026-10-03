"use client"

import * as React from "react"
import { toast } from "sonner"
import { Loader2, ShieldAlert, Rocket, PauseCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useGoLiveStatus, useVendorProfile, usePublishProfile, useUnpublishProfile } from "@/lib/queries/profile"
import { ClientApiError } from "@/lib/api/client"

/*
 * The publish / unpublish control. The ONLY "go live" affordance in the app —
 * shared by GoLiveCard (/settings/profile) and SetupOverview (/setup). It calls
 * the existing publish/unpublish endpoints; publishVendorProfile enforces
 * getVendorGoLiveStatus server-side, so the disabled state here is UX only.
 */
export function GoLiveButton() {
  const [confirmingPause, setConfirmingPause] = React.useState(false)
  const { data: status } = useGoLiveStatus()
  const { data: profile } = useVendorProfile()
  const publish = usePublishProfile()
  const unpublish = useUnpublishProfile()

  if (!status) return null

  async function handlePublish() {
    try {
      await publish.mutateAsync()
      toast.success("You're live!")
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Failed to go live")
    }
  }

  /*
   * "Pause storefront", not "Take offline": it unpublishes the storefront and
   * nothing else — menu, locations and payout setup are untouched, and Go live
   * brings it straight back. Confirmed first, because it takes the vendor out
   * of every customer's view at once.
   */
  async function handleUnpublish() {
    try {
      await unpublish.mutateAsync()
      setConfirmingPause(false)
      toast.success("Storefront paused", {
        description: "Customers can't see you until you go live again. Your menu and locations are unchanged.",
      })
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Couldn't pause your storefront")
    }
  }

  return (
    <div className="space-y-3">
      {profile?.reviewStatus === "MANUALLY_REJECTED" && profile.rejectionReason && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive-bg p-3 text-sm text-destructive">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span>{profile.rejectionReason} — edit your profile to resubmit it for review.</span>
        </div>
      )}

      {status.isPublished ? (
        <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmingPause(true)}>
          <PauseCircle className="size-3.5" /> Pause storefront
        </Button>
      ) : (
        <Button type="button" variant="success" size="sm" onClick={handlePublish} disabled={!status.canGoLive || publish.isPending}>
          {publish.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />} Go live
        </Button>
      )}

      <AlertDialog
        open={confirmingPause}
        onOpenChange={(open) => { if (!unpublish.isPending) setConfirmingPause(open) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause your storefront?</AlertDialogTitle>
            <AlertDialogDescription>
              Customers won&apos;t be able to find you or order until you go live again. Your menu,
              locations and payout details stay exactly as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unpublish.isPending}>Keep it live</AlertDialogCancel>
            <AlertDialogAction
              // Kept open until the write settles, so a failure is seen here.
              onClick={(event) => { event.preventDefault(); void handleUnpublish() }}
              disabled={unpublish.isPending}
              variant="destructive"
            >
              {unpublish.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Pause storefront
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
