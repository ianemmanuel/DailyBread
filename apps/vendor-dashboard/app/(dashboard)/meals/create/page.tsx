import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PageGrid } from "@/components/dashboard/layout/DashboardShell"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { MealForm } from "@/components/meals/MealForm"
import { requireSetupAccess } from "@/lib/vendor/guards"

export const metadata = { title: "Add a meal" }

export default async function CreateMealPage() {
  await requireSetupAccess()

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
        title="Add a meal"
        description="Write it once. It appears at every location you choose, and you can price it differently anywhere it differs."
      />
      <MealForm />
    </PageGrid>
  )
}
