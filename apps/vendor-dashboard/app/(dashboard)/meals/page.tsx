import Link from "next/link"
import { Plus, UtensilsCrossed } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { PageGrid } from "@/components/dashboard/layout/DashboardShell"
import { ListPagination } from "@/components/dashboard/layout/ListPagination"
import { MealCard } from "@/components/meals/MealCard"
import { getMenuItems, getMenuContext } from "@/lib/vendor/menu"
import { requireSetupAccess } from "@/lib/vendor/guards"

export const metadata = { title: "Meals" }

const PAGE_SIZE = 12

type Search = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/*
 * The vendor's menu. Authoring, so it is available before they go live — a
 * merchant builds their menu while banking is still being verified.
 */
export default async function MealsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireSetupAccess()

  const sp     = await searchParams
  const search = one(sp.search)
  const page   = Math.max(1, Number(one(sp.page) ?? 1) || 1)

  const [list, context] = await Promise.all([
    getMenuItems({ search, page, pageSize: PAGE_SIZE }),
    getMenuContext(),
  ])

  const buildHref = (nextPage: number) => {
    const qs = new URLSearchParams()
    if (search) qs.set("search", search)
    if (nextPage > 1) qs.set("page", String(nextPage))
    return qs.toString() ? `/meals?${qs}` : "/meals"
  }

  return (
    <PageGrid>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Meals"
          description="Write a dish once and sell it at whichever locations serve it."
        />
        <Button asChild className="gap-1.5 rounded-full">
          <Link href="/meals/create">
            <Plus className="size-4" />
            Add a meal
          </Link>
        </Button>
      </div>

      {list.items.length === 0 ? (
        <div className="dash-card p-10 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
            <UtensilsCrossed className="size-5 text-(--primary)" />
          </div>
          <h2 className="mt-4 text-sm font-semibold text-(--foreground)">
            {search ? "No meals match that search" : "Your menu is empty"}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-(--muted-foreground)">
            {search
              ? "Try a different word, or clear the search to see everything."
              : "Add your first dish. You can build the whole menu now — it goes live with your storefront."}
          </p>
          {!search && (
            <Button asChild className="mt-4 gap-1.5 rounded-full">
              <Link href="/meals/create">
                <Plus className="size-4" />
                Add a meal
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.items.map((item) => (
            <MealCard key={item.id} item={item} currency={context.currency} />
          ))}
        </div>
      )}

      <ListPagination
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        buildHref={buildHref}
        label="meals"
      />
    </PageGrid>
  )
}
