import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { ArrowLeft, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminFetch, ApiCallError } from "@/lib/api"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"
import { AdminPermissions } from "@repo/types/admin-app"
import type { AuditLogEntry } from "@/types"

export const metadata: Metadata = { title: "Audit Event" }

interface Props { params: Promise<{ id: string }> }

function actorLine(actor: AuditLogEntry["adminUser"]): string {
  if (!actor) return "System"
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(" ")
  return name ? `${name} (${actor.email})` : actor.email
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <pre className="mt-1.5 max-h-96 overflow-auto rounded-lg bg-muted/40 p-3 text-xs text-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

export default async function AuditLogDetailPage({ params }: Props) {
  const { id } = await params
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()
  const sessionRes = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/auth/session`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 } },
  )
  if (!sessionRes.ok) redirect("/sign-in")
  const { data: session }: ApiSuccess<AdminSessionData> = await sessionRes.json()
  if (!session.permissions.includes(AdminPermissions.AUDIT_LOGS_ALL_READ)) redirect("/overview")

  let log: AuditLogEntry
  try {
    log = await adminFetch<AuditLogEntry>(`/admin/v1/audit/${id}`, { next: { revalidate: 30 } })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  return (
    <div className="page-content animate-slide-up">

      <Button asChild variant="ghost" size="sm" className="-ml-1">
        <Link href="/identity/audit"><ArrowLeft className="mr-1.5 h-4 w-4" />Back</Link>
      </Button>

      <div className="admin-card flex items-start gap-4">
        <div className="icon-badge icon-badge-primary h-11 w-11">
          <History className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">{log.action}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(log.createdAt).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="admin-card">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Performed by</p>
          <p className="mt-1 text-sm font-medium text-foreground">{actorLine(log.adminUser)}</p>
        </div>
        <div className="admin-card">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Target admin</p>
          <p className="mt-1 text-sm font-medium text-foreground">{actorLine(log.target)}</p>
        </div>
      </div>

      <div className="admin-card space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Details</h2>
        <JsonBlock label="Before" value={log.changes?.before} />
        <JsonBlock label="After" value={log.changes?.after} />
        <JsonBlock label="Metadata" value={log.metadata} />
        {!log.changes && !log.metadata && (
          <p className="text-sm text-muted-foreground">No additional detail recorded for this event.</p>
        )}
      </div>
    </div>
  )
}
