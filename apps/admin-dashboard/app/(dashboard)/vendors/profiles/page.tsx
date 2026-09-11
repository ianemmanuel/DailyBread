import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { UserCheck, Flag, CheckCircle2, XCircle, FileDown, ChevronRight } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import { TableFilterBar } from "@/components/shared/TableFilterBar"
import { TablePagination } from "@/components/shared/TablePagination"
import { EmptyState } from "@/components/shared/EmptyState"
import { flagSummary } from "@/components/vendors/profile-flag-meta"
import { QueueDot } from "@/components/shared/QueueDot"
import { AdminPermissions } from "@repo/types/admin-app"
import type { VendorProfileListResult, ProfileReviewStatus } from "@/types"

export const metadata: Metadata = { title: "Vendor Profiles" }
export const revalidate = 60

const PAGE_SIZE = 10

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; country?: string; status?: string }>
}

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "FLAGGED",          label: "Flagged" },
  { value: "",                 label: "All" },
  { value: "AUTO_APPROVED",    label: "Auto-approved" },
  { value: "MANUALLY_APPROVED",label: "Approved" },
  { value: "MANUALLY_REJECTED",label: "Rejected" },
]

const STATUS_BADGE: Record<ProfileReviewStatus, string> = {
  AUTO_APPROVED     : "badge-success",
  FLAGGED           : "badge-warning",
  MANUALLY_APPROVED : "badge-success",
  MANUALLY_REJECTED : "badge-danger",
}

const STATUS_LABEL: Record<ProfileReviewStatus, string> = {
  AUTO_APPROVED: "Auto-approved", FLAGGED: "Flagged", MANUALLY_APPROVED: "Approved", MANUALLY_REJECTED: "Rejected",
}

export default async function VendorProfilesPage({ searchParams }: PageProps) {
  const session = await getAdminSession()

  // Moderation itself lives on the detail page now, so the queue only needs
  // READ — the MODERATE check moved to where the buttons are.
  if (!session.permissions.includes(AdminPermissions.VENDORS_PROFILES_READ)) redirect("/vendors")

  const params  = await searchParams
  const page    = params.page   ?? "1"
  const search  = params.search ?? ""
  const country = params.country ?? ""
  const status  = params.status ?? "FLAGGED"

  const { countries: allCountries, showFilter: showCountryFilter } = await getFilterableCountries(session.scope.isGlobal)

  const qsParams: Record<string, string> = { page, pageSize: String(PAGE_SIZE) }
  if (search)  qsParams.search  = search
  if (country) qsParams.country = country
  if (status)  qsParams.status  = status
  const qs = new URLSearchParams(qsParams)

  const result = await adminFetch<VendorProfileListResult>(`/admin/v1/vendors/profiles?${qs}`, {
    next: { revalidate: 60, tags: ["vendor-profiles"] },
  }).catch(() => null)

  const counts = result?.counts ?? { flagged: 0, autoApproved: 0, manuallyApproved: 0, manuallyRejected: 0 }

  const statCards = [
    { label: "Flagged",  value: counts.flagged,          icon: Flag,        badgeClass: "icon-badge-warning" },
    { label: "Approved", value: counts.manuallyApproved, icon: CheckCircle2,badgeClass: "icon-badge-success" },
    { label: "Rejected", value: counts.manuallyRejected, icon: XCircle,     badgeClass: "icon-badge-danger" },
  ]

  return (
    <div className="page-content animate-slide-up">
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/vendors" className="hover:text-foreground transition-colors">Vendors</Link>
          <span>/</span>
          <span className="text-foreground">Profiles</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="icon-badge icon-badge-primary h-10 w-10">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Public Profiles</h1>
              <p className="text-sm text-muted-foreground">
                Vendor public-profile moderation — profiles auto-flagged for inappropriate content or a name that duplicates another vendor's in the same country.
              </p>
            </div>
          </div>
          <a
            href={`/api/vendors/profiles/export?${qs}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] transition-colors hover:border-primary/40 hover:text-primary"
          >
            <FileDown className="h-3.5 w-3.5" />
            Export CSV
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {statCards.map(({ label, value, icon: Icon, badgeClass }) => (
          <div key={label} className="stat-card">
            <div className={`icon-badge h-12 w-12 ${badgeClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="stat-card-value">{value}</p>
              <p className="stat-card-label">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 p-1 w-fit">
        {STATUS_TABS.map(({ value, label }) => {
          const qp = new URLSearchParams()
          if (search)  qp.set("search", search)
          if (country) qp.set("country", country)
          if (value)   qp.set("status", value)
          const href = qp.toString() ? `/vendors/profiles?${qp}` : "/vendors/profiles"
          const active = status === value
          return (
            <Link
              key={value || "all"}
              href={href}
              className={[
                "inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                active ? "bg-card text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {label}
              {value === "FLAGGED" && <QueueDot show={counts.flagged > 0} />}
            </Link>
          )
        })}
      </div>

      <TableFilterBar
        searchPlaceholder="Search display name, business, owner, or email…"
        defaultSearch={search}
        {...(showCountryFilter ? { countryOptions: allCountries.map((c) => ({ value: c.slug, label: c.name })), defaultCountry: country } : {})}
      />

      {!result || result.profiles.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="No profiles to show"
          description="Nothing matches these filters right now."
        />
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs uppercase tracking-wide">Vendor</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide lg:table-cell">Flag reasons</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Published</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.profiles.map((profile) => (
                  <TableRow key={profile.id} className="hover:bg-muted/10">
                    <TableCell className="font-medium text-foreground">
                      <Link href={`/vendors/profiles/${profile.vendorAccountId}`} className="hover:text-primary hover:underline">
                        {profile.displayName}
                      </Link>
                      <p className="text-xs font-normal text-muted-foreground">{profile.vendor.legalBusinessName}</p>
                    </TableCell>
                    <TableCell>
                      <span className={STATUS_BADGE[profile.reviewStatus]}>{STATUS_LABEL[profile.reviewStatus]}</span>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {flagSummary(profile)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className={profile.isPublished ? "badge-success" : "badge-neutral"}>
                        {profile.isPublished ? "Live" : "Not live"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* One obvious way in. Moderating from the row meant
                          deciding without ever seeing the profile — including
                          its logo and cover, which the row cannot show. */}
                      <Link
                        href={`/vendors/profiles/${profile.vendorAccountId}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3.5 py-1.5 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        View
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {result && (
        <TablePagination
          total={result.total}
          page={result.page}
          totalPages={result.totalPages}
          basePath="/vendors/profiles"
          params={{ ...(search ? { search } : {}), ...(country ? { country } : {}), ...(status ? { status } : {}) }}
          itemLabel="profiles"
        />
      )}
    </div>
  )
}
