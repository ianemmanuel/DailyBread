import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PageGrid } from "@/components/dashboard/layout/DashboardShell"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { MenuForm } from "@/components/menus/MenuForm"
import { requireSetupAccess } from "@/lib/vendor/guards"

export const metadata = { title: "New menu" }

export default async function CreateMenuPage() {
  await requireSetupAccess()
  return (
    <PageGrid>
      <Link href="/menus" className="group inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
        Back to menus
      </Link>
      <PageHeader title="New menu" description="Choose a location, name the menu, add its image, then pick the meals it lists." />
      <MenuForm />
    </PageGrid>
  )
}
