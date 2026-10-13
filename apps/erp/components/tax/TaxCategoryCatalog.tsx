import { redirect } from "next/navigation"
import { Layers, Globe2, UtensilsCrossed } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { TaxCategoryTable } from "./TaxCategoryTable"
import { TaxCategoryFormSheet } from "./TaxCategoryFormSheet"
import type { TaxCategory } from "@/types/tax.types"

/*
 * The platform's tax vocabulary — the distinctions any market is allowed to
 * charge differently for.
 *
 * Global by nature and global to change: a country picks rates FROM this list
 * on its own page, it never adds to it. That split is the whole design, and it
 * is why this screen carries no country selector.
 */

export async function TaxCategoryCatalog() {
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.FINANCE_TAX_READ)) redirect("/overview")

  /*
   * Catalog mutations are GLOBAL-only in the backend (assertGlobalTaxScope),
   * so a country-scoped admin holding the manage key would still be refused.
   * Hide the controls rather than render-then-403 — same reasoning as the
   * food-tag and vendor-category catalogs.
   */
  const canManage =
    session.permissions.includes(AdminPermissions.FINANCE_TAX_MANAGE) && session.scope.isGlobal

  const categories = await adminFetch<TaxCategory[]>("/admin/v1/tax/categories?includeRetired=true", {
    next: { revalidate: 60, tags: ["tax-categories"] },
  }).catch(() => null)

  /*
   * A failed load is said out loud rather than drawn as an empty catalog. The
   * two look identical otherwise, which is exactly how a working page reads as
   * broken — the same fix the inspections and payout-account pages got.
   */
  if (!categories) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader icon={Layers} title="Tax categories" description="The platform's tax vocabulary" />
        <div className="admin-card border-destructive/40 p-6">
          <p className="text-sm font-medium text-destructive">Couldn&apos;t load the tax categories.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The request failed rather than coming back empty. Refresh, and if it keeps happening the
            backend is likely unreachable.
          </p>
        </div>
      </div>
    )
  }

  const active = categories.filter((c) => c.status === "ACTIVE")
  const inUse = categories.filter((c) => c._count.countryRates > 0)
  const onDishes = categories.reduce((sum, c) => sum + c._count.menuItems, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Layers}
        title="Tax categories"
        description="What any market is allowed to charge a different rate for"
        actions={canManage ? <TaxCategoryFormSheet /> : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<Layers className="size-4" />} label="Active categories" value={active.length} />
        <StatCard icon={<Globe2 className="size-4" />} label="Rated by a country" value={inUse.length} />
        <StatCard icon={<UtensilsCrossed className="size-4" />} label="Meals using one" value={onDishes} />
      </div>

      <div className="admin-card p-4 text-sm text-muted-foreground sm:p-5">
        <p>
          A rate depends on what the food is, not only on where it is sold. The UK zero-rates cold
          takeaway food while taxing the same shop&apos;s hot food at the standard rate, and several US
          states and Canadian provinces draw comparable lines. These are the distinctions the platform
          can express.
        </p>
        <p className="mt-2">
          Rates live on each country&apos;s own tax page. A market that charges one flat rate configures a
          single category, and its vendors never see the concept at all.
        </p>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No tax categories yet"
          description="Run the finance seed to load the standard vocabulary, or add one here."
        />
      ) : (
        <TaxCategoryTable categories={categories} canManage={canManage} />
      )}
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="admin-card flex items-center gap-3 p-4">
      <span className="icon-badge">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  )
}
