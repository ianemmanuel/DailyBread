import Link from "next/link"
import { Eye } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { TablePagination } from "@/components/shared/TablePagination"
import type { ListAuditLogsResult, AuditLogActor } from "@/types"

interface Props {
  result   : ListAuditLogsResult | null
  page     : string
  action   : string
  search?  : string
  dateFrom?: string
  dateTo?  : string
}

const ACTION_STYLE: Record<string, { label: string; badge: string }> = {
  "admin_user.created"              : { label: "Created",              badge: "badge-info" },
  "admin_user.invited"              : { label: "Invited",               badge: "badge-info" },
  "admin_user.permissions_updated"  : { label: "Permissions updated",   badge: "badge-neutral" },
  "admin_user.role_updated"         : { label: "Role changed",          badge: "badge-neutral" },
  "admin_user.scopes_updated"       : { label: "Scope changed",         badge: "badge-neutral" },
  "admin_user.suspended"            : { label: "Suspended",             badge: "badge-warning" },
  "admin_user.reinstated"           : { label: "Reinstated",            badge: "badge-success" },
  "admin_user.deactivated"          : { label: "Deactivated",           badge: "badge-danger" },
  "admin_user.availability_changed" : { label: "Availability changed",  badge: "badge-neutral" },
}

function ActionBadge({ action }: { action: string }) {
  const style = ACTION_STYLE[action] ?? { label: action, badge: "badge-neutral" }
  return <span className={`${style.badge} text-[11px]`}>{style.label}</span>
}

function actorName(actor: AuditLogActor | null): string {
  if (!actor) return "System"
  return [actor.firstName, actor.lastName].filter(Boolean).join(" ") || actor.email
}

export function AuditLogTable({ result, page, action, search, dateFrom, dateTo }: Props) {
  if (!result || result.logs.length === 0) {
    return (
      <div className="admin-card flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-medium text-foreground">No audit events found</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Try adjusting your filters, or check back after admin-management actions occur.
        </p>
      </div>
    )
  }

  return (
    <div className="admin-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs uppercase tracking-wide">Action</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Target admin</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Performed by</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">When</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.logs.map((log) => (
              <TableRow key={log.id} className="hover:bg-muted/10">
                <TableCell>
                  <ActionBadge action={log.action} />
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium text-foreground">{actorName(log.target)}</span>
                  {log.target && <p className="text-xs text-muted-foreground">{log.target.email}</p>}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className="text-sm text-muted-foreground">{actorName(log.adminUser)}</span>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span
                    className="font-mono text-xs text-muted-foreground"
                    title={new Date(log.createdAt).toLocaleString()}
                  >
                    {new Date(log.createdAt).toLocaleDateString()}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="ghost" className="gap-1.5 rounded-full">
                    <Link href={`/identity/audit/${log.id}`}>
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        total={result.total}
        page={page}
        totalPages={result.totalPages}
        basePath="/identity/audit"
        params={{
          ...(action   ? { status: action }   : {}),
          ...(search   ? { search }           : {}),
          ...(dateFrom ? { dateFrom }         : {}),
          ...(dateTo   ? { dateTo }           : {}),
        }}
        itemLabel="events"
      />
    </div>
  )
}
