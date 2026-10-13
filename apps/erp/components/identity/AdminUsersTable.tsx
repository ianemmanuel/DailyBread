import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserStatusBadge } from "@/components/identity/UserStatusBadge"
import { UserActionsMenu } from "@/components/identity/UserActionsMenu"
import { TablePagination } from "@/components/shared/TablePagination"
import { detailHref, formatDate } from "@/lib/identity/format"
import type { AdminUserScope, ListAdminUsersResult } from "@/types"

interface Props {
  result            : ListAdminUsersResult | null
  page              : string
  search            : string
  status            : string
  country?          : string
  showCountryColumn?: boolean
}

function CountryCell({ scopes }: { scopes: AdminUserScope[] }) {
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

const HEAD = "text-xs uppercase tracking-wide"

/** Rows only lead to the details page; every account action is taken there. */
export function AdminUsersTable({ result, page, search, status, country, showCountryColumn }: Props) {
  if (!result) {
    return (
      <div className="admin-card flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-medium text-foreground">The administrator list could not be loaded</p>
        <p className="mt-1 text-xs text-muted-foreground">Reload the page to try again.</p>
      </div>
    )
  }
  if (result.users.length === 0) {
    const filtered = Boolean(search || (status && status !== "all") || (country && country !== "all"))
    return (
      <div className="admin-card flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-medium text-foreground">{filtered ? "No administrators match these filters" : "No administrators in your scope yet"}</p>
        {filtered && <p className="mt-1 text-xs text-muted-foreground">Clear a filter or change the search.</p>}
      </div>
    )
  }

  return (
    <div className="admin-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className={HEAD}>Name</TableHead>
              <TableHead className={`hidden sm:table-cell ${HEAD}`}>Role</TableHead>
              <TableHead className={HEAD}>Status</TableHead>
              <TableHead className={`hidden md:table-cell ${HEAD}`}>{showCountryColumn ? "Country" : "Joined"}</TableHead>
              <TableHead className={`text-right ${HEAD}`}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.users.map((user) => {
              const displayName = [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ")
              return (
                <TableRow key={user.id} className="hover:bg-muted/10">
                  <TableCell>
                    <Link href={detailHref(user.id)} className="group block">
                      <p className="font-medium text-foreground transition-colors group-hover:text-primary">{displayName}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="text-sm text-muted-foreground">{user.role?.displayName ?? "—"}</span>
                  </TableCell>
                  <TableCell>
                    <UserStatusBadge status={user.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {showCountryColumn
                      ? <CountryCell scopes={user.scopes} />
                      : <span className="text-xs text-muted-foreground">{formatDate(user.createdAt)}</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <UserActionsMenu userId={user.id} displayName={displayName} />
                  </TableCell>
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
        basePath="/identity"
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
