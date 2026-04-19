import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { Building2, ShieldAlert, Ban, CheckCircle } from "lucide-react"
import { adminFetch } from "@/lib/api"
import {
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow,
} from "@repo/ui/components/table"
import { Button } from "@repo/ui/components/button"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"
import { AdminPermissions } from "@repo/types/admin-app"
import type { VendorListResult } from "@/types"

export const metadata: Metadata = { title: "Vendor Accounts" }
export const revalidate = 60

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    ACTIVE   : "badge-success",
    SUSPENDED: "badge-warning",
    BANNED   : "badge-danger",
  }
  return <span className={cls[status] ?? "badge-neutral"}>{status}</span>
}

export default async function VendorAccountsPage({ searchParams }: PageProps) {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()
  const sessionRes = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/auth/session`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 } },
  )
  if (!sessionRes.ok) redirect("/sign-in")
  const { data: session }: ApiSuccess<AdminSessionData> = await sessionRes.json()

  if (!session.permissions.includes(AdminPermissions.VENDORS_ACCOUNTS_READ)) redirect("/vendors")

  const params   = await searchParams
  const page     = params.page   ?? "1"
  const search   = params.search ?? ""
  const status   = params.status ?? ""

  const qs = new URLSearchParams({
    page, pageSize: "20",
    ...(search ? { search }  : {}),
    ...(status && status !== "all" ? { status } : {}),
  })

  const [result, active, suspended] = await Promise.all([
    adminFetch<VendorListResult>(`/admin/v1/vendors/accounts?${qs}`, {
      next: { revalidate: 60, tags: ["vendor-accounts"] },
    }).catch(() => null),
    adminFetch<VendorListResult>(`/admin/v1/vendors/accounts?status=ACTIVE&pageSize=1`, {
      next: { revalidate: 60 },
    }).catch(() => ({ total: 0 })),
    adminFetch<VendorListResult>(`/admin/v1/vendors/accounts?status=SUSPENDED&pageSize=1`, {
      next: { revalidate: 60 },
    }).catch(() => ({ total: 0 })),
  ])

  const statusCards = [
    { s: "",          label: "Total",     icon: Building2,   count: result?.total ?? 0 },
    { s: "ACTIVE",    label: "Active",    icon: CheckCircle, count: (active as any)?.total ?? 0 },
    { s: "SUSPENDED", label: "Suspended", icon: ShieldAlert, count: (suspended as any)?.total ?? 0 },
  ]

  return (
    <div className="page-content animate-slide-up">
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/vendors" className="hover:text-foreground transition-colors">Vendors</Link>
          <span>/</span>
          <span className="text-foreground">Accounts</span>
        </nav>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground">Vendor Accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Active vendor accounts on the platform.</p>
      </div>

      {/* Status overview */}
      <div className="grid gap-3 sm:grid-cols-3">
        {statusCards.map(({ s, label, icon: Icon, count }) => (
          <Link key={label}
            href={s ? `/vendors/accounts?status=${s}` : "/vendors/accounts"}
            className={["admin-card flex items-center gap-3 transition-colors hover:border-primary/30",
              status === s ? "border-primary/50" : ""].join(" ")}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-foreground">{count}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="admin-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs uppercase tracking-wide">Business</TableHead>
                <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Type</TableHead>
                <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Country</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                <TableHead className="hidden text-xs uppercase tracking-wide lg:table-cell">Joined</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!result || result.accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    No accounts found.
                  </TableCell>
                </TableRow>
              ) : result.accounts.map((acc) => (
                <TableRow key={acc.id} className="hover:bg-muted/10">
                  <TableCell>
                    <Link href={`/vendors/accounts/${acc.id}`} className="group block">
                      <p className="font-medium text-foreground transition-colors group-hover:text-primary">
                        {acc.legalBusinessName}
                      </p>
                      <p className="text-xs text-muted-foreground">{acc.businessEmail}</p>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {acc.vendorType?.name ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {acc.country?.name ?? "—"}
                  </TableCell>
                  <TableCell><StatusBadge status={acc.status} /></TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(acc.createdAt).toLocaleDateString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/vendors/accounts/${acc.id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {result && result.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">{result.total} accounts</p>
            <div className="flex items-center gap-2">
              {parseInt(page) > 1 && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/vendors/accounts?page=${parseInt(page) - 1}&status=${status}`}>Previous</Link>
                </Button>
              )}
              <span className="text-xs text-muted-foreground">Page {page} of {result.totalPages}</span>
              {parseInt(page) < result.totalPages && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/vendors/accounts?page=${parseInt(page) + 1}&status=${status}`}>Next</Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}