import Link from "next/link"
import { BookOpen, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { PageGrid } from "@/components/dashboard/layout/DashboardShell"
import { MenuCard } from "@/components/menus/MenuCard"
import { getMenus } from "@/lib/vendor/menus"
import { requireSetupAccess } from "@/lib/vendor/guards"

export const metadata = { title: "Menus" }

/*
 * Every menu across the vendor's locations. Authoring, so available before
 * going live — the same guard as meals. A failed read throws to the error
 * boundary rather than rendering as an empty list (bug class #4).
 */
export default async function MenusPage() {
  await requireSetupAccess()
  const menus = await getMenus()

  return (
    <PageGrid>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Menus"
          description="Group the meals each location sells into named menus, like Breakfast or All day."
        />
        <Button asChild className="gap-1.5 rounded-full">
          <Link href="/menus/create"><Plus className="size-4" />New menu</Link>
        </Button>
      </div>

      {menus.length === 0 ? (
        <div className="dash-card p-10 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
            <BookOpen className="size-5 text-primary" />
          </div>
          <h2 className="mt-4 text-sm font-semibold text-foreground">No menus yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            A menu is a named selection of the meals a location already sells, with its own image or logo.
          </p>
          <Button asChild className="mt-4 gap-1.5 rounded-full">
            <Link href="/menus/create"><Plus className="size-4" />New menu</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {menus.map((menu) => <MenuCard key={menu.id} menu={menu} />)}
        </div>
      )}
    </PageGrid>
  )
}
