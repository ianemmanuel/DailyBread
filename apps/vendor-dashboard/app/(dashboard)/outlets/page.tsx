import Link from "next/link"
import { Plus, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { PageGrid } from "@/components/dashboard/layout/DashboardShell"
import { ListPagination } from "@/components/dashboard/layout/ListPagination"
import { OutletCard } from "@/components/outlets/OutletCard"
import { OutletFilterBar } from "@/components/outlets/OutletFilterBar"
import { OutletsEmptyState } from "@/components/outlets/OutletsEmptyState"
import { getOutlets, getOutletCities } from "@/lib/vendor/outlets"
import { requireSetupAccess } from "@/lib/vendor/guards"

const PAGE_SIZE = 12

type Search = Record<string, string | string[] | undefined>

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function OutletsPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  await requireSetupAccess()

  const sp     = await searchParams
  const search = one(sp.search)
  const status = one(sp.status)
  const cityId = one(sp.cityId)
  const page   = Math.max(1, Number(one(sp.page) ?? 1) || 1)

  const [list, cities] = await Promise.all([
    getOutlets({ search, status, cityId, page, pageSize: PAGE_SIZE }),
    getOutletCities(),
  ])

  const buildHref = (nextPage: number) => {
    const qs = new URLSearchParams()
    if (search) qs.set("search", search)
    if (status) qs.set("status", status)
    if (cityId) qs.set("cityId", cityId)
    if (nextPage > 1) qs.set("page", String(nextPage))
    return qs.size ? `/outlets?${qs}` : "/outlets"
  }

  return (
    <PageGrid>
      <PageHeader
        title="Your Outlets"
        description="Manage your kitchen locations and operating settings."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="gap-2 rounded-xl">
              <Link href="/outlets/revenue"><TrendingUp className="size-4" />Revenue</Link>
            </Button>
            <Button
              asChild
              className="gap-2 rounded-xl"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              <Link href="/outlets/create"><Plus className="size-4" />Add Outlet</Link>
            </Button>
          </div>
        }
      />

      <OutletFilterBar cities={cities} />

      {list.outlets.length === 0 ? (
        <OutletsEmptyState filtered={Boolean(search || status || cityId)} />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {list.outlets.map((outlet) => <OutletCard key={outlet.id} outlet={outlet} />)}
          </div>
          <ListPagination
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            buildHref={buildHref}
            label="outlets"
          />
        </>
      )}
    </PageGrid>
  )
}
