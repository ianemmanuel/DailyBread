import { CircleCheck, Hourglass } from "lucide-react"
import { adminName, formatDate } from "@/lib/identity/format"
import type { PermissionSetupState } from "@/types"

/** The account's initial permission setup, as the backend recorded it. Nothing for an account never invited. */
export function SetupStatusNote({ setup }: { setup: PermissionSetupState | null | undefined }) {
  if (setup?.status === "PENDING") {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-amber-600/25 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <Hourglass aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-medium">No permissions assigned yet.</span>
          {" "}Invited on {formatDate(setup.openedAt)} — this account can&apos;t do anything until it&apos;s given permissions.
        </span>
      </p>
    )
  }
  if (setup?.status === "COMPLETED") {
    return (
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <CircleCheck aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span>
          Initial setup completed{setup.resolvedBy ? ` by ${adminName(setup.resolvedBy)}` : ""}{setup.resolvedAt ? ` on ${formatDate(setup.resolvedAt)}` : ""}.
        </span>
      </p>
    )
  }
  return null
}
