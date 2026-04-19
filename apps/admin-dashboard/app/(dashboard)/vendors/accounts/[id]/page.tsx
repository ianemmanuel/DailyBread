import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { ArrowLeft, Building2 } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { adminFetch, ApiCallError } from "@/lib/api"
import { DocumentsSection }    from "@/components/vendors/DocumentsSection"
import { VendorAccountActions } from "@/components/vendors/VendorAccountActions"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"
import { AdminPermissions } from "@repo/types/admin-app"

export const metadata: Metadata = { title: "Vendor Account" }

interface Props { params: Promise<{ id: string }> }

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    ACTIVE   : "badge-success",
    SUSPENDED: "badge-warning",
    BANNED   : "badge-danger",
  }
  return <span className={cls[status] ?? "badge-neutral"}>{status}</span>
}

export default async function VendorAccountDetailPage({ params }: Props) {
  const { id }               = await params
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

  let account: any
  try {
    account = await adminFetch(`/admin/v1/vendors/accounts/${id}`, {
      next: { revalidate: 60, tags: [`vendor-account-${id}`] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const canSuspend  = session.permissions.includes(AdminPermissions.VENDORS_ACCOUNTS_SUSPEND)
  const canBan      = session.permissions.includes(AdminPermissions.VENDORS_ACCOUNTS_BAN)
  // Vendor account documents are view-only — no approve/reject after account creation
  const canApprove  = false

  return (
    <div className="page-content animate-slide-up">

      <Button asChild variant="ghost" size="sm" className="-ml-1">
        <Link href="/vendors/accounts"><ArrowLeft className="mr-1.5 h-4 w-4" />Back to Accounts</Link>
      </Button>

      {/* Header card */}
      <div className="admin-card flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground">
              {account.legalBusinessName}
            </h1>
            <p className="text-sm text-muted-foreground">{account.businessEmail}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={account.status} />
              <span className="badge-neutral">{account.vendorType?.name ?? "—"}</span>
              <span className="badge-neutral">{account.country?.name ?? "—"}</span>
            </div>
          </div>
        </div>

        <VendorAccountActions
          vendorId={id}
          currentStatus={account.status}
          canSuspend={canSuspend}
          canBan={canBan}
        />
      </div>

      {/* Suspension / ban notice */}
      {account.suspensionReason && account.status !== "ACTIVE" && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 px-5 py-4">
          <p className="text-sm font-semibold text-warning">
            {account.status === "BANNED" ? "Banned" : "Suspended"}
          </p>
          <p className="mt-0.5 text-sm text-foreground">{account.suspensionReason}</p>
          {account.suspendedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Since {new Date(account.suspendedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* Business details */}
      <div className="admin-card space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Business Details</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ["Owner",          `${account.ownerFirstName} ${account.ownerLastName}`],
            ["Owner email",    account.ownerEmail  ?? "—"],
            ["Owner phone",    account.ownerPhone  ?? "—"],
            ["Business phone", account.businessPhone ?? "—"],
            ["Reg. number",    account.companyRegNumber ?? "—"],
            ["Tax ID",         account.taxRegistrationNumber ?? "—"],
            ["Address",        account.businessAddress],
            ["Joined",         new Date(account.createdAt).toLocaleDateString()],
            ["Outlets",        String(account._count?.outlets ?? 0)],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-sm text-foreground">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Outlets */}
      {account.outlets?.length > 0 && (
        <div className="admin-card overflow-hidden p-0">
          <div className="border-b border-border/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              Outlets ({account.outlets.length})
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs uppercase tracking-wide">Name</TableHead>
                <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">City</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {account.outlets.map((outlet: any) => (
                <TableRow key={outlet.id} className="hover:bg-muted/10">
                  <TableCell className="font-medium text-foreground">{outlet.name}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {outlet.city?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span className={outlet.adminStatus === "ACTIVE" ? "badge-success" : "badge-warning"}>
                      {outlet.adminStatus}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/*
        Documents — uses DocumentsSection (same component as application review)
        canApprove=false because vendor account docs are read-only after account creation.
        The expand/preview functionality still works; approve/reject buttons are hidden.
        applicationId is passed as the vendorId here — DocumentRow uses it only for
        the view signed-url route which is doc-id based anyway.
      */}
      {account.documents?.length > 0 && (
        <DocumentsSection
          docs={account.documents}
          applicationId={id}
          currentStatus="APPROVED"
          canApprove={canApprove}
        />
      )}

    </div>
  )
}