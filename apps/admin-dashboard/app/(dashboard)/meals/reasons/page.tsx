import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ListChecks, Globe2, MapPin } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { TablePagination } from "@/components/shared/TablePagination"
import { EmptyState } from "@/components/shared/EmptyState"
import { ReasonForm } from "@/components/meals/ReasonForm"
import { ActionReasonRowMenu } from "@/components/meals/ActionReasonRowMenu"
import type { MealReasonLibrary } from "@/types"

export const metadata: Metadata = { title: "Action Reasons" }

const PAGE_SIZE = 10

/**
 * Action Reasons — the predefined reasons admins choose when taking a
 * consequential marketplace action. Paged on the server, 10 a page; the rest
 * of a reason lives on its details page. What each viewer may add or edit is
 * the server's answer (canCreate* / canManage), never re-derived here.
 */
export default async function ActionReasonsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.VENDORS_MEALS_READ)) redirect("/overview")
  const { page = "1" } = await searchParams

  const lib = await adminFetch<MealReasonLibrary>(
    `/admin/v1/vendors/meals/reasons/library?page=${encodeURIComponent(page)}&pageSize=${PAGE_SIZE}`,
    { cache: "no-store" },
  ).catch(() => null)

  return (
    <div className="page-content animate-slide-up">
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/meals" className="transition-colors hover:text-foreground">Meals</Link>
          <span>/</span>
          <span className="text-foreground">Action Reasons</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="icon-badge icon-badge-primary h-10 w-10"><ListChecks className="h-5 w-5" /></div>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Action Reasons</h1>
              <p className="text-sm text-muted-foreground">
                The predefined reasons behind sending back, hiding, suspending and banning.
              </p>
            </div>
          </div>
          {lib && (lib.canCreateGlobal || lib.canCreateCountry) && (
            <ReasonForm
              mode="create"
              countryId={lib.canCreateGlobal ? null : lib.canCreateCountry?.id ?? null}
              reachLabel={lib.canCreateGlobal
                ? "Platform-wide — every country without its own version"
                : `${lib.canCreateCountry?.name ?? "Your country"} only`}
            />
          )}
        </div>
      </div>

      {!lib ? (
        <div className="admin-card text-sm text-destructive">
          Couldn&apos;t load action reasons. Reload the page, or check your access.
        </div>
      ) : lib.total === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No action reasons yet"
          description="Until one exists, no consequential meal action can be taken. Run the admin seed, or create one."
        />
      ) : lib.reasons.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nothing on this page"
          description={`There are ${lib.total} action reasons. Go back to the first page to see them.`}
          actionLabel="First page"
          actionHref="/meals/reasons"
        />
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs uppercase tracking-wide">Action reason</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Reach</TableHead>
                <TableHead className="w-12 text-right text-xs uppercase tracking-wide"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lib.reasons.map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/10">
                  <TableCell className="py-3">
                    <Link href={`/meals/reasons/${r.id}`} className="text-sm font-medium text-foreground hover:text-primary hover:underline">
                      {r.label}
                    </Link>
                    {!r.isActive && <span className="badge-neutral ml-2 align-middle">Inactive</span>}
                  </TableCell>
                  <TableCell className="py-3 text-sm">
                    {r.countryName ? (
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {r.countryName}
                        {r.replacesPlatformId && <span className="text-xs text-muted-foreground">· country version</span>}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
                        Platform-wide
                        {r.countryVersions.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            · replaced in {r.countryVersions.length} {r.countryVersions.length === 1 ? "country" : "countries"}
                          </span>
                        )}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <ActionReasonRowMenu reason={r} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {lib && lib.total > 0 && (
        <TablePagination total={lib.total} page={lib.page} totalPages={lib.totalPages} basePath="/meals/reasons" itemLabel="action reasons" />
      )}
    </div>
  )
}
