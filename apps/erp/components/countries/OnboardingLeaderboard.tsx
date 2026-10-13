import Link from "next/link"
import { Users } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import type { CountryOnboardingLeaderboardEntry } from "@repo/types/admin-app"

interface Props {
  entries     : CountryOnboardingLeaderboardEntry[]
  quarterLabel: string
}

/**
 * Real data — grouped VendorApplication.submittedAt counts, ranked
 * highest-first, already scope-filtered server-side. Always includes
 * every ACTIVE in-scope country (even zero-count ones), so we only ever
 * need to slice for display, never filter.
 */
export function OnboardingLeaderboard({ entries, quarterLabel }: Props) {
  const visible = entries.length > 5 ? entries.slice(0, 5) : entries

  return (
    <div className="admin-card">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Vendor Onboarding</h2>
          <p className="text-xs text-muted-foreground">Applications submitted — {quarterLabel}.</p>
        </div>
        <div className="icon-badge icon-badge-info h-9 w-9 shrink-0">
          <Users className="h-4 w-4" />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No onboarding activity"
          description="No active countries have vendor applications for this quarter yet."
        />
      ) : (
        <ul className="space-y-1">
          {visible.map((entry, i) => (
            <li key={entry.countryId}>
              <Link
                href={`/countries/${entry.slug}`}
                className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/40"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                  {entry.name}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {entry.count.toLocaleString()}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">applications</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
