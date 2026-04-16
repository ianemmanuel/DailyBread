import type { Metadata }         from "next"
import { redirect, notFound }    from "next/navigation"
import Link                      from "next/link"
import { auth }                  from "@clerk/nextjs/server"
import { ArrowLeft }             from "lucide-react"
import { Button }                from "@repo/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { adminFetch, ApiCallError } from "@/lib/api"
import { VendorApplicationStatusBadge } from "@/components/vendors/VendorApplicationStatusBadge"
import { ApplicationActions }    from "@/components/vendors/ApplicationActions"
import { DocumentViewer }        from "@/components/vendors/DocumentViewer"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"
import { AdminPermissions }      from "@repo/types/admin-app"

export const metadata: Metadata = { title: "Application Review" }

interface Props { params: Promise<{ id: string }> }

export default async function ApplicationDetailPage({ params }: Props) {
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

  if (!session.permissions.includes(AdminPermissions.VENDORS_READ)) redirect("/vendors")

  let application: any
  try {
    application = await adminFetch(`/admin/v1/vendors/applications/${id}`, {
      next: { revalidate: 60, tags: [`vendor-application-${id}`] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const canApprove = session.permissions.includes(AdminPermissions.VENDORS_APPROVE)

  return (
    <div className="page-content animate-slide-up">

      <Button asChild variant="ghost" size="sm" className="-ml-1">
        <Link href="/vendors"><ArrowLeft className="mr-1.5 h-4 w-4" />Back to Vendors</Link>
      </Button>

      {/* Header card */}
      <div className="admin-card flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">
            {application.legalBusinessName}
          </h1>
          <p className="text-sm text-muted-foreground">{application.businessEmail}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <VendorApplicationStatusBadge status={application.status} />
            <span className="badge-neutral">{application.vendorType?.name}</span>
            <span className="badge-neutral">{application.country?.name}</span>
          </div>
        </div>
        {canApprove && (
          <ApplicationActions applicationId={id} currentStatus={application.status} />
        )}
      </div>

      {/* Rejection banner */}
      {application.rejectionReason && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 space-y-1">
          <p className="text-sm font-semibold text-destructive">Rejected</p>
          <p className="text-sm text-foreground">{application.rejectionReason}</p>
          {application.revisionNotes && (
            <p className="text-xs text-muted-foreground">{application.revisionNotes}</p>
          )}
        </div>
      )}

      {/* Business details */}
      <div className="admin-card space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Business Details</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ["Owner",             `${application.ownerFirstName} ${application.ownerLastName}`],
            ["Owner email",       application.ownerEmail  ?? "—"],
            ["Owner phone",       application.ownerPhone  ?? "—"],
            ["Business phone",    application.businessPhone ?? "—"],
            ["Registration No.",  application.registrationNumber ?? "—"],
            ["Tax ID",            application.taxId ?? "—"],
            ["Address",           application.businessAddress],
            ["Submitted",         application.submittedAt ? new Date(application.submittedAt).toLocaleDateString() : "Not submitted"],
            ["Revisions",         String(application.revisionCount ?? 0)],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-sm text-foreground">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Documents table */}
      {application.documents?.length > 0 && (
        <div className="admin-card overflow-hidden p-0">
          <div className="border-b border-border/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              Documents ({application.documents.length})
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs uppercase tracking-wide">Document</TableHead>
                <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Expiry</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-right">Preview</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {application.documents.map((doc: any) => (
                <TableRow key={doc.id} className="hover:bg-muted/10">
                  <TableCell>
                    <p className="text-sm font-medium text-foreground">{doc.documentType?.name}</p>
                    {doc.documentName && (
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">{doc.documentName}</p>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                    {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <span className={
                      doc.status === "APPROVED" ? "badge-success" :
                      doc.status === "REJECTED" ? "badge-danger"  :
                      doc.status === "EXPIRED"  ? "badge-warning" : "badge-neutral"
                    }>
                      {doc.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <DocumentViewer document={doc} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

    </div>
  )
}