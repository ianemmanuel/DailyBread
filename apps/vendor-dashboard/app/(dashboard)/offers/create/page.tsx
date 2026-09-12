import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { DiscountForm } from "@/components/discounts/DiscountForm"
import { requireSetupAccess } from "@/lib/vendor/guards"

export const metadata = { title: "New offer" }

export default async function CreateOfferPage() {
  await requireSetupAccess()

  return (
    <div className="space-y-6">
      <Link
        href="/offers"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="size-4" />
        Back to offers
      </Link>
      <PageHeader title="New offer" description="Set it up once. It starts and stops on its own." />
      <DiscountForm />
    </div>
  )
}
