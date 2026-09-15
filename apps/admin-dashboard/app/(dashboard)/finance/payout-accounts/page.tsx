import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Landmark, Clock, ShieldAlert, ShieldX, CheckCircle2, ChevronRight } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import { TableFilterBar } from "@/components/shared/TableFilterBar"
import { TablePagination } from "@/components/shared/TablePagination"
import { EmptyState } from "@/components/shared/EmptyState"
import { QueueDot } from "@/components/shared/QueueDot"
import { PAYOUT_STATUS_BADGE, PAYOUT_STATUS_LABEL, PAYOUT_FAILURE_LABEL } from "@/components/finance/payout-account-status"
import { AdminPermissions } from "@repo/types/admin-app"
import type { AdminPayoutAccountListResult } from "@repo/types/admin-app"

export const metadata: Metadata = { title: "Vendor Payout Accounts" }
export const revalidate = 30

const PAGE_SIZE = 10

const TABS = [
  { value: "REQUIRES_REVIEW", label: "Requires review" },
  { value: "PENDING",         label: "Pending" },
  { value: "FAILED",          label: "Failed" },
  { value: "VERIFIED",        label: "Verified" },
  { value: "DEACTIVATED",     label: "Deactivated" },
  { value: "",                label: "All" },
]

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; country?: string; status?: string }>
}

export default async function VendorPayoutAccountsPage({ searchParams }: PageProps) {
  const session = await getAdminSession()
  // Finance-domain operational view — held by the finance role (and super
  // admin). A country-scoped finance admin only ever sees their own country's
  // accounts (enforced by the backend, not this page).
  if (!session.permissions.includes(AdminPermissions.FINANCE_PAYOUTS_READ)) redirect("/overview")
  const canManage = session.permissions.includes(AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_MANAGE)

  const params  = await searchParams
  const page    = params.page   ?? "1"
  const search  = params.search ?? ""
  const country = params.country ?? ""
  const status  = params.status ?? "REQUIRES_REVIEW"

  const { countries, showFilter } = await getFilterableCountries(session.scope.isGlobal)

  const qsParams: Record<string, string> = { page, pageSize: String(PAGE_SIZE) }
  if (search)  qsParams.search  = search
  if (country) qsParams.country = country
  if (status)  qsParams.status  = status
  const qs = new URLSearchParams(qsParams)

  const result = await adminFetch<AdminPayoutAccountListResult>(`/admin/v1/finance/payout-accounts?${qs}`, {
    next: { revalidate: 30, tags: ["finance-payout-accounts"] },
  }).catch(() => null)

  const counts = result?.counts ?? { pending: 0, failed: 0, requiresReview: 0, verified: 0, deactivated: 0 }
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1

  const statCards = [
    { label: "Requires review", value: counts.requiresReview, icon: ShieldAlert, badgeClass: "icon-badge-warning" },
    { label: "Pending",         value: counts.pending,        icon: Clock,       badgeClass: "icon-badge-info" },
    { label: "Failed",          value: counts.failed,         icon: ShieldX,     badgeClass: "icon-badge-danger" },
    { label: "Verified",        value: counts.verified,       icon: CheckCircle2,badgeClass: "icon-badge-success" },
  ]

  return (
    <div className="page-content animate-slide-up">
      <Link
        href="/finance"
        className="group inline-flex w-fit items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-[var(--shadow-xs)] transition-all group-hover:-translate-x-0.5 group-hover:border-primary/40 group-hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
        </span>
        Back to Finance
      </Link>

      <div className="admin-card flex flex-wrap items-center gap-4">
        <div className="icon-badge icon-badge-primary h-12 w-12"><Landmark className="h-5 w-5" /></div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Vendor Payout Accounts</h1>
          <p className="text-sm text-muted-foreground">
            The verification state of every vendor&apos;s bank / mobile-money / wallet payout account
            {session.scope.isGlobal ? " across all countries" : " in your country"}. Only a verified account can receive payouts.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, badgeClass }) => (
          <div key={label} className="stat-card">
            <div className={`icon-badge h-12 w-12 ${badgeClass}`}><Icon className="h-5 w-5" /></div>
            <div>
              <p className="stat-card-value">{value}</p>
              <p className="stat-card-label">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 p-1 w-fit">
        {TABS.map(({ value, label }) => {
          const qp = new URLSearchParams()
          if (search)  qp.set("search", search)
          if (country) qp.set("country", country)
          if (value)   qp.set("status", value)
          const href = qp.toString() ? `/finance/payout-accounts?${qp}` : "/finance/payout-accounts"
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
              {value === "REQUIRES_REVIEW" && <QueueDot show={counts.requiresReview > 0} />}
              {value === "PENDING" && <QueueDot show={counts.pending > 0} />}
            </Link>
          )
        })}
      </div>

      <TableFilterBar
        searchPlaceholder="Search vendor, bank, or account holder…"
        defaultSearch={search}
        {...(showFilter ? { countryOptions: countries.map((c) => ({ value: c.slug, label: c.name })), defaultCountry: country } : {})}
      />

      {!result || result.accounts.length === 0 ? (
        (() => {
          /*
           * The counts are search-aware, so when a search finds nothing in
           * THIS tab we can say where it did match instead of a dead end.
           * The status tabs default to a work queue (Requires review), so a
           * plain "no results" here is usually the status filter hiding a
           * real match, not an absent vendor.
           */
          const elsewhere = Object.entries({
            REQUIRES_REVIEW: counts.requiresReview,
            PENDING        : counts.pending,
            FAILED         : counts.failed,
            VERIFIED       : counts.verified,
            DEACTIVATED    : counts.deactivated,
          }).filter(([tab, n]) => tab !== status && n > 0)

          if (search && elsewhere.length > 0) {
            const total = elsewhere.reduce((sum, [, n]) => sum + n, 0)
            return (
              <EmptyState
                icon={Landmark}
                title={`No match under "${TABS.find((t) => t.value === status)?.label ?? "this filter"}"`}
                description={`${total} account${total === 1 ? "" : "s"} match "${search}" under another status.`}
                actionLabel="Search all statuses"
                actionHref={`?status=&search=${encodeURIComponent(search)}`}
              />
            )
          }
          return (
            <EmptyState
              icon={Landmark}
              title="No payout accounts to show"
              description="Nothing matches these filters right now."
            />
          )
        })()
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs uppercase tracking-wide">Vendor</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Country</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Method / account</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.accounts.map((a) => (
                  <TableRow key={a.id} className="hover:bg-muted/10">
                    <TableCell className="font-medium text-foreground">
                      <Link href={`/finance/payout-accounts/${a.id}`} className="hover:text-primary hover:underline">
                        {a.vendorName}
                      </Link>
                      {a.accountHolderName && (
                        <p className="text-xs font-normal text-muted-foreground">{a.accountHolderName}</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{a.countryName}</TableCell>
                    <TableCell className="text-sm">
                      <span className="text-foreground">{a.bankName ?? a.methodName}</span>
                      <p className="font-mono text-xs text-muted-foreground">{a.maskedAccount}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className={PAYOUT_STATUS_BADGE[a.isActive ? a.verificationStatus : "DEACTIVATED"]}>
                          {PAYOUT_STATUS_LABEL[a.isActive ? a.verificationStatus : "DEACTIVATED"]}
                        </span>
                        {a.isDefault && a.isActive && <span className="badge-info">Default</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Reason and Added moved to the detail page — the list
                          is a queue, and one obvious way in beats a row that
                          is subtly clickable in two different places. */}
                      <Link
                        href={`/finance/payout-accounts/${a.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
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
          totalPages={totalPages}
          basePath="/finance/payout-accounts"
          params={{ ...(search ? { search } : {}), ...(country ? { country } : {}), ...(status ? { status } : {}) }}
          itemLabel="payout accounts"
        />
      )}

      {!canManage && (
        <p className="text-xs text-muted-foreground">
          You have read access to this queue. Verifying or rejecting an account requires the payout-account management permission.
        </p>
      )}
    </div>
  )
}
