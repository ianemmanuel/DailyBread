import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { ModifierLibrary } from "@/components/meals/ModifierLibrary"
import { getMenuContext } from "@/lib/vendor/menu"
import { requireSetupAccess } from "@/lib/vendor/guards"

export const metadata = { title: "Options" }

/*
 * The library of option groups.
 *
 * A child of /meals rather than a top-level item: an option group is not a
 * thing a vendor sells, it is part of how a dish is sold. The same groups are
 * created and edited from the meal form, so a vendor never has to come here
 * first — this is where they manage them across the whole menu at once.
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
        description="Sizes, flavours, drinks and extras — build a group once and reuse it on any dish."
      />

      <ModifierLibrary currency={context.currency} />
    </div>
  )
}
