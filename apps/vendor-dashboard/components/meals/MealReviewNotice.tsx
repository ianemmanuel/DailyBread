import { AlertTriangle, Undo2 } from "lucide-react"
import type { MenuItem } from "@/lib/queries/menu"

/*
 * Why a dish is not selling, said where the vendor can act on it.
 *
 * Screening is non-blocking — the meal saved either way — so without this the
 * vendor would have a dish that exists, looks fine, and quietly never reaches a
 * customer. Editing a flagged field re-runs the checks automatically, which is
 * exactly what the notice tells them to do.
 */

const REASON_COPY: Record<string, string> = {
  INAPPROPRIATE_NAME       : "the name",
  INAPPROPRIATE_DESCRIPTION: "the description",
}

export function MealReviewNotice({ item }: { item: MenuItem }) {
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
          Edit it below and save — that puts it straight back in for review.
        </p>
      </div>
    )
  }

  if (item.reviewStatus !== "FLAGGED") return null

  const fields = item.flagReasons.map((r) => REASON_COPY[r] ?? "some of the wording").filter(Boolean)

  return (
    <div className="rounded-2xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-5 py-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-[var(--warning)]" />
        <p className="text-sm font-semibold text-[var(--foreground)]">Waiting on a quick review</p>
      </div>
      <p className="mt-1 text-sm text-[var(--foreground)]">
        Our automatic checks flagged {fields.length > 0 ? fields.join(" and ") : "this meal"}. Someone will look
        at it shortly, and it stays off the menu until they do.
      </p>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        If you spot the problem yourself, editing and saving re-runs the checks immediately.
      </p>
    </div>
  )
}
