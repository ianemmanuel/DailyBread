import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { MenuArranger } from "@/components/meals/MenuArranger"
import { getMenuContext } from "@/lib/vendor/menu"
import { requireSetupAccess } from "@/lib/vendor/guards"

export const metadata = { title: "Arrange menu" }

/*
 * The menu in the order a customer meets it.
 *
 * Separate from /meals because that list is paginated and searchable, and
 * arranging needs the whole menu at once — you cannot decide what comes third
 * while looking at page two.
 */
export default async function ArrangeMenuPage() {
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
        title="Arrange menu"
        description="Sections run top to bottom, and dishes run in order inside each one — exactly as a customer sees them."
      />

      <MenuArranger currency={context.currency} />
    </div>
  )
}
