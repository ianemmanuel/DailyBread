"use client"

import Link from "next/link"
import { useModifierGroups } from "@/lib/queries/menu"

/*
 * Which of THIS dish's option groups is holding it back, and why.
 *
 * A dish's own payload only says which groups it offers. The verdict on a
 * group — under review, or sent back with a reason — lives on the group,
 * because one group can sit on many dishes. So this reads the vendor's own
 * library (the same query the form's options section already uses, so it is
 * usually cached) and joins by id, rather than widening the dish contract.
 *
 * The fix is always made on the group, in the option-group library: saving
 * changed wording re-runs the checks, and every dish using it follows.
 */
export function MealOptionGroupIssues({ groupIds }: { groupIds: string[] }) {
  const { data: groups } = useModifierGroups()
  const issues = (groups ?? []).filter(
    (g) => groupIds.includes(g.id) && (g.reviewStatus === "FLAGGED" || g.reviewStatus === "MANUALLY_REJECTED"),
  )
  if (issues.length === 0) return null

  return (
    <ul className="mt-3 space-y-2">
      {issues.map((g) => (
        <li key={g.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
          <p className="font-medium text-[var(--foreground)]">
            “{g.name}”{" "}
            <span className="text-xs font-normal text-[var(--muted-foreground)]">
              {g.reviewStatus === "MANUALLY_REJECTED" ? "· changes needed" : "· under review"}
            </span>
          </p>
          {g.reviewStatus === "MANUALLY_REJECTED" ? (
            <p className="mt-0.5 whitespace-pre-line text-xs text-[var(--foreground)]">
              {g.rejectionReason ?? "An admin asked for changes to these options."}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              Our checks flagged some of its wording. Someone will look at it shortly.
            </p>
          )}
          <Link href="/meals/options" className="mt-1 inline-block text-xs font-medium text-[var(--primary)] hover:underline">
            Edit it in your option groups →
          </Link>
        </li>
      ))}
    </ul>
  )
}
