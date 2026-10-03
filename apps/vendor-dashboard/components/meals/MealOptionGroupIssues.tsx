import type { AttachedModifierGroup } from "@/lib/queries/menu"

/*
 * Which of THIS meal's option groups is holding it back, and why.
 *
 * A group belongs to one meal, so its verdict — under review, or sent back
 * with a reason — arrives on the meal itself, and the fix is made right here
 * in the meal's Options section: saving changed wording re-runs the checks.
 */
export function MealOptionGroupIssues({ groups }: { groups: AttachedModifierGroup[] }) {
  const issues = groups.filter((g) => g.reviewStatus === "FLAGGED" || g.reviewStatus === "MANUALLY_REJECTED")
  if (issues.length === 0) return null

  return (
    <ul className="mt-3 space-y-2">
      {issues.map((g) => (
        <li key={g.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <p className="font-medium text-foreground">
            “{g.name}”{" "}
            <span className="text-xs font-normal text-muted-foreground">
              {g.reviewStatus === "MANUALLY_REJECTED" ? "· changes needed" : "· under review"}
            </span>
          </p>
          {g.reviewStatus === "MANUALLY_REJECTED" ? (
            <p className="mt-0.5 whitespace-pre-line text-xs text-foreground">
              {g.rejectionReason ?? "An admin asked for changes to these options."}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Our checks flagged some of its wording. Someone will look at it shortly.
            </p>
          )}
          <a href="#options" className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
            Edit it in this meal&apos;s options ↓
          </a>
        </li>
      ))}
    </ul>
  )
}
