import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PageGrid } from "@/components/dashboard/layout/DashboardShell"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { MealForm } from "@/components/meals/MealForm"
import { MealReviewNotice } from "@/components/meals/MealReviewNotice"
import { getMenuItem } from "@/lib/vendor/menu"
import { requireSetupAccess } from "@/lib/vendor/guards"

export const metadata = { title: "Edit meal" }

export default async function EditMealPage({ params }: { params: Promise<{ itemId: string }> }) {
  await requireSetupAccess()

  const { itemId } = await params
  const item = await getMenuItem(itemId)
  if (!item) notFound()

  return (
    <PageGrid>
      <Link
        href="/meals"
        className="group inline-flex w-fit items-center gap-2 text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
        Back to menu
      </Link>
      <PageHeader
        title={item.name}
        description="Editing here updates this dish at every location that serves it."
      />
      <MealReviewNotice item={item} />
      <MealForm item={item} />
    </PageGrid>
  )
}
