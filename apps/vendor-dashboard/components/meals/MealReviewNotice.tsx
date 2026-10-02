import { AlertTriangle, Undo2 } from "lucide-react"
import type { MenuItem } from "@/lib/queries/menu"
import { MealOptionGroupIssues } from "./MealOptionGroupIssues"

/*
 * Why a dish is not selling, said where the vendor can act on it.
 *
 * Screening is non-blocking — the meal saved either way — so without this the
 * vendor would have a dish that exists, looks fine, and quietly never reaches a
 * customer. Editing a flagged field re-runs the checks automatically, which is
 * exactly what the notice tells them to do.
 *
 * A dish can also be held back by one of its OPTION GROUPS (the modifier
 * reason). That fix is made on the group, not here, so the notice names the
 * group and its own verdict — "under review", or "changes needed" with the
 * admin's reason — and links to where it is edited.
 */

const OPTIONS_REASON = "INAPPROPRIATE_MODIFIER"

const REASON_COPY: Record<string, string> = {
  INAPPROPRIATE_NAME       : "the name",
  INAPPROPRIATE_DESCRIPTION: "the description",
}

export function MealReviewNotice({ item }: { item: MenuItem }) {
  const heldByOptions = item.flagReasons.includes(OPTIONS_REASON)
  const groupIds      = item.modifierGroups.map((g) => g.id)

  if (item.reviewStatus === "MANUALLY_REJECTED") {
    return (
      <div className="rounded-2xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Undo2 className="size-4 shrink-0 text-[var(--destructive)]" />
          <p className="text-sm font-semibold text-[var(--destructive)]">Changes needed before this can sell</p>
        </div>
        <p className="mt-1 whitespace-pre-line text-sm text-[var(--foreground)]">
          {item.rejectionReason ?? "An admin asked for changes to this meal."}
        </p>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          {heldByOptions
            ? "If the change is to its options, edit the option group below — this meal goes back in for review once you do. Otherwise, edit it here and save."
            : "Edit it below and save — that puts it straight back in for review."}
        </p>
        {heldByOptions && <MealOptionGroupIssues groupIds={groupIds} />}
      </div>
    )
  }

  if (item.reviewStatus !== "FLAGGED") return null

  const fields = item.flagReasons
    .filter((r) => r !== OPTIONS_REASON)
    .map((r) => REASON_COPY[r] ?? "some of the wording")

  return (
    <div className="rounded-2xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-5 py-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-[var(--warning)]" />
        <p className="text-sm font-semibold text-[var(--foreground)]">
          {heldByOptions && fields.length === 0 ? "Held back by one of its option groups" : "Waiting on a quick review"}
        </p>
      </div>
      {fields.length > 0 && (
        <p className="mt-1 text-sm text-[var(--foreground)]">
          Our automatic checks flagged {fields.join(" and ")}. Someone will look at it shortly, and it stays off
          the menu until they do.
        </p>
      )}
      {heldByOptions && (
        <p className="mt-1 text-sm text-[var(--foreground)]">
          It stays off the menu until the option group below is cleared.
        </p>
      )}
      {!heldByOptions && fields.length === 0 && (
        // Back in the queue with nothing flagged in its own words — what a
        // dish looks like after its option group was fixed.
        <p className="mt-1 text-sm text-[var(--foreground)]">
          Your changes are with us for a quick review, and it stays off the menu until then.
        </p>
      )}
      {heldByOptions && <MealOptionGroupIssues groupIds={groupIds} />}
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        If you spot the problem yourself, editing and saving re-runs the checks immediately.
      </p>
    </div>
  )
}
