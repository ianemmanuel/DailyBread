import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PageGrid } from "@/components/dashboard/layout/DashboardShell"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { MenuForm } from "@/components/menus/MenuForm"
import { getMenu } from "@/lib/vendor/menus"
import { requireSetupAccess } from "@/lib/vendor/guards"

export const metadata = { title: "Menu" }

/** One menu, read and edited in place. Another vendor's id is a 404 from the
 *  backend and renders as not found here — never as "not allowed". */
export default async function MenuPage({ params }: { params: Promise<{ menuId: string }> }) {
  await requireSetupAccess()
  const { menuId } = await params
  const menu = await getMenu(menuId)
  if (!menu) notFound()

  return (
    <PageGrid>
      <Link href="/menus" className="group inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
        Back to menus
      </Link>
      <PageHeader title={menu.name} description={`At ${menu.outlet.name} · ${menu.mealCount} meal${menu.mealCount === 1 ? "" : "s"}`} />
      {/* Keyed on the saved version: after a save the page refreshes in place
          and the form re-seeds — the staged logo it held has been consumed. */}
      <MenuForm key={menu.updatedAt} menu={menu} />
    </PageGrid>
  )
}
