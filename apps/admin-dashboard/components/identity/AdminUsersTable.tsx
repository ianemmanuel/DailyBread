import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { UserStatusBadge }  from "@/components/identity/UserStatusBadge"
import { UserActionsMenu }  from "@/components/identity/UserActionsMenu"
import { TablePagination } from "@/components/shared/TablePagination"
import type { ListAdminUsersResult } from "@/types"

interface Props {
  result            : ListAdminUsersResult | null
  page              : string
  search            : string
  status            : string
  country?          : string
  showCountryColumn?: boolean
  canInvite         : boolean
  canSuspend        : boolean
  canReinstate      : boolean
  canDeactivate     : boolean
}

function CountryCell({ scopes }: { scopes: any[] }) {
  if (!scopes || scopes.length === 0) return <span className="text-xs text-muted-foreground">—</span>
  if (scopes.some((s) => s.scopeType === "GLOBAL")) {
    return <span className="badge-info text-[10px]">🌍 Global</span>
  }
  const codes = [...new Set(scopes.map((s) => s.country?.code).filter(Boolean))] as string[]
  if (codes.length === 0) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map((code) => (
        <span key={code} className="badge-neutral font-mono text-[10px] uppercase">{code}</span>
      ))}
    </div>
  )
}

export function AdminUsersTable({ result, page, search, status, country, showCountryColumn, canInvite, canSuspend, canReinstate, canDeactivate }: Props) {
  const canManage = canSuspend || canReinstate || canDeactivate
  if (!result || result.users.length === 0) {
    return (
      <div className="admin-card flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-medium text-foreground">No users found</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Try adjusting your search or filter criteria.
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
              <TableHead className="text-xs uppercase tracking-wide">Name</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Employee ID</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Role</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
              {showCountryColumn ? (
                <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Country</TableHead>
              ) : (
                <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Joined</TableHead>
              )}
              {(canInvite || canManage) && (
                <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.users.map((user: any) => {
              const displayName = [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ")
              const href = (user.status === "pending" || user.status === "invited")
                ? `/identity/manage/${user.id}/review`
                : `/identity/manage/${user.id}`

              return (
                <TableRow key={user.id} className="hover:bg-muted/10">
                  <TableCell>
                    <Link href={href} className="group block">
                      <p className="font-medium text-foreground transition-colors group-hover:text-primary">
                        {displayName}
                      </p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="font-mono text-xs text-muted-foreground">
                      {user.employeeId ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {user.role?.displayName ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <UserStatusBadge status={user.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {showCountryColumn ? (
                      <CountryCell scopes={user.scopes} />
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </TableCell>
                  {(canInvite || canManage) && (
                    <TableCell className="text-right">
                      <UserActionsMenu
                        user={{ ...user, displayName }}
                        canInvite={canInvite}
                        canSuspend={canSuspend}
                        canReinstate={canReinstate}
                        canDeactivate={canDeactivate}
                      />
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        total={result.total}
        page={page}
        totalPages={result.totalPages}
        basePath="/identity/manage"
        params={{
          ...(search  ? { search }  : {}),
          ...(status  ? { status }  : {}),
          ...(country ? { country } : {}),
        }}
        itemLabel="users"
      />
    </div>
  )
}