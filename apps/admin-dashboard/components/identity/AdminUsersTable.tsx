import Link from "next/link"
import { Button } from "@repo/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { UserStatusBadge }  from "@/components/identity/UserStatusBadge"
import { UserActionsMenu }  from "@/components/identity/UserActionsMenu"
import type { ListAdminUsersResult } from "@/types"

interface Props {
  result    : ListAdminUsersResult | null
  page      : string
  search    : string
  status    : string
  canInvite : boolean
  canManage : boolean
}

export function AdminUsersTable({ result, page, search, status, canInvite, canManage }: Props) {
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
              <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Joined</TableHead>
              {(canInvite || canManage) && (
                <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.users.map((user: any) => {
              const displayName = [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ")
              const href = (user.status === "pending" || user.status === "invited")
                ? `/identity/${user.id}/review`
                : `/identity/${user.id}`

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
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                  </TableCell>
                  {(canInvite || canManage) && (
                    <TableCell className="text-right">
                      <UserActionsMenu
                        user={{ ...user, displayName }}
                        canInvite={canInvite}
                        canManage={canManage}
                      />
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {result.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {result.total} user{result.total !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            {parseInt(page) > 1 && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/identity?page=${parseInt(page) - 1}&search=${search}&status=${status}`}>
                  Previous
                </Link>
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              Page {page} of {result.totalPages}
            </span>
            {parseInt(page) < result.totalPages && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/identity?page=${parseInt(page) + 1}&search=${search}&status=${status}`}>
                  Next
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}