import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { DiscountForm } from "@/components/discounts/DiscountForm"
import { requireSetupAccess } from "@/lib/vendor/guards"
import { getDiscount } from "@/lib/vendor/discounts"

export const metadata = { title: "Offer" }

export default async function EditOfferPage({
  params,
}: {
  params: Promise<{ discountId: string }>
}) {
  await requireSetupAccess()
  const { discountId } = await params
  const discount = await getDiscount(discountId)
  if (!discount) notFound()

  return (
    <div className="space-y-6">
      <Link
        href="/offers"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="size-4" />
        Back to offers
      </Link>
      <PageHeader title={discount.name} description="Changes take effect straight away." />
      <DiscountForm discount={discount} />
    </div>
  )
}
