import Link from "next/link"
import { Building2, Globe2, Hourglass, MapPin } from "lucide-react"
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

const PLACE_CHIP = "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground shadow-xs"

/** Where an administrator works: the one scope, as a small pill with an icon for its tier. */
function CountryCell({ scopes }: { scopes: AdminUserScope[] }) {
  const s = scopes?.[0]
  if (!s) return <span className="text-xs text-muted-foreground">—</span>
  if (s.scopeType === "GLOBAL") {
    return <span className={PLACE_CHIP}><Globe2 aria-hidden className="h-3.5 w-3.5 text-sky-600" />Global</span>
  }
  const country = s.country
  if (!country) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <span className={PLACE_CHIP} title={s.scopeType === "CITY" && s.city ? `${s.city.name}, ${country.name}` : country.name}>
      {s.scopeType === "CITY"
        ? <Building2 aria-hidden className="h-3.5 w-3.5 text-violet-600" />
        : <MapPin aria-hidden className="h-3.5 w-3.5 text-emerald-600" />}
      {s.scopeType === "CITY" && s.city ? s.city.name : country.name}
      <span className="font-mono text-[10px] uppercase text-muted-foreground">{country.code}</span>
    </span>
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      <UserStatusBadge status={user.status} />
                      {user.permissionSetup?.status === "PENDING" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                          <Hourglass aria-hidden className="h-3 w-3" />
                          Needs permissions
                        </span>
                      )}
                    </div>
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
