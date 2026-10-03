import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { ModifierLibrary } from "@/components/meals/ModifierLibrary"
import { getMenuContext } from "@/lib/vendor/menu"
import { requireSetupAccess } from "@/lib/vendor/guards"

export const metadata = { title: "Options" }

/*
 * Every meal's options at a glance — the service view.
 *
 * A child of /meals rather than a top-level item: an option group is not a
 * thing a vendor sells, it is part of how a dish is sold. Each group belongs
 * to one meal and is edited there; this page is where a kitchen turns a
 * choice off mid-shift without opening a meal.
 *
 * Authoring, so the same guard as the rest of the menu: a vendor builds this
 * while banking is still being verified.
 */
export default async function MealOptionsPage() {
  await requireSetupAccess()
  const context = await getMenuContext()

  return (
    <div className="space-y-6">
      <Link
        href="/meals"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="size-4" />
        Back to meals
      </Link>

      <PageHeader
        title="Options"
        description="Every meal's sizes, sides and extras. Turn a choice off when you run out; edit names and prices on the meal."
      />

      <ModifierLibrary currency={context.currency} />
    </div>
  )
}
