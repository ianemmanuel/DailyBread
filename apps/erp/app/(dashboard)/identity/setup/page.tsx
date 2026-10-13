import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ClipboardList } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { SetupLaneTabs, SetupQueue } from "@/components/identity/setup/SetupQueue"
import { parseLane } from "@/components/identity/setup/setup-lanes"
import type { ListPendingSetupsResult } from "@/types"

export const metadata: Metadata = { title: "Pending setup" }

interface Props { searchParams: Promise<{ lane?: string; page?: string }> }

/*
 * Invited administrators still waiting for their first permissions. ONE task
 * per account, shared by everyone who may complete it; the backend decides
 * who sees which, in which lane, and what counts on the sidebar. Completing
 * happens on the account's own page, through the same permission editor.
 */
export default async function PendingSetupPage({ searchParams }: Props) {
  const session = await getAdminSession()
  if (
    !session.permissions.includes(AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE) &&
    !session.permissions.includes(AdminPermissions.ADMIN_USERS_PERMISSIONS_RECOVER)
  ) {
    redirect("/overview")
  }

  const { lane: rawLane, page = "1" } = await searchParams
  const lane = parseLane(rawLane)
  const qs = new URLSearchParams({ page, pageSize: "20", ...(lane === "all" ? {} : { lane }) })

  // Uncached: a setup completed by a colleague must disappear on the next view.
  const result = await adminFetch<ListPendingSetupsResult>(`/admin/v1/users/permission-setup?${qs}`, { cache: "no-store" })
    .catch(() => null)

  return (
    <div className="page-content animate-slide-up">
      <div className="admin-card flex items-center gap-4">
        <div className="icon-badge icon-badge-primary h-12 w-12">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Pending setup</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Invited administrators waiting for their first permissions. Once one person sets them up, they leave everyone&apos;s queue.
          </p>
        </div>
      </div>

      {result && result.counts.total > 0 && <SetupLaneTabs result={result} lane={lane} />}
      <SetupQueue result={result} lane={lane} />
    </div>
  )
}
