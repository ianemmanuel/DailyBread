import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, Store } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { PageGrid } from "@/components/dashboard/layout/DashboardShell"
import { OutletCard } from "@/components/outlets/OutletCard"
import type { Outlet } from "@/types/outlet"

const BACKEND = process.env.BACKEND_API_URL

async function getOutlets(token: string): Promise<Outlet[]> {
  try {
    const res = await fetch(`${BACKEND}/vendor/v1/outlets/`, {
      headers: { Authorization: `Bearer ${token}` },
      next   : { tags: ["vendor-outlets"] },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.data ?? []
  } catch {
    return []
  }
}

export default async function OutletsPage() {
  const { getToken } = await auth()
  const token = await getToken()
  if (!token) redirect("/sign-in")

  const outlets = await getOutlets(token)

  return (
    <PageGrid>
      <PageHeader
        title="Your Outlets"
        description="Manage your kitchen locations and operating settings."
        actions={
          <Button
            asChild
            className="gap-2 rounded-xl"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            <Link href="/outlets/create">
              <Plus className="size-4" />Add Outlet
            </Link>
          </Button>
        }
      />

      {outlets.length === 0 ? (
        /* Empty state */
        <div
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center"
          style={{ borderColor: "var(--border)" }}
        >
          <div
            className="mb-4 flex size-16 items-center justify-center rounded-2xl"
            style={{ background: "color-mix(in oklch, var(--primary) 10%, transparent)" }}
          >
            <Store className="size-8 text-[var(--primary)]" />
          </div>
          <h3 className="mb-1 text-lg font-semibold text-[var(--foreground)]">No outlets yet</h3>
          <p className="mb-6 max-w-xs text-sm text-[var(--muted-foreground)]">
            Add your first kitchen location to start receiving orders.
          </p>
          <Button
            asChild
            className="gap-2 rounded-xl"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            <Link href="/outlets/create">
              <Plus className="size-4" />Create your first outlet
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {outlets.map((outlet) => (
            <OutletCard key={outlet.id} outlet={outlet} />
          ))}
        </div>
      )}
    </PageGrid>
  )
}