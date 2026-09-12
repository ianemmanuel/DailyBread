import Link from "next/link"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { DiscountList } from "@/components/discounts/DiscountList"
import { getMenuContext } from "@/lib/vendor/menu"
import { requireSetupAccess } from "@/lib/vendor/guards"

export const metadata = { title: "Offers" }

/*
 * Merchant-funded offers.
 *
 * Authoring tier, like the menu: a vendor can build and schedule a launch
 * promotion before their storefront is published, and it starts on its own once
 * they go live.
 */
export default async function OffersPage() {
  await requireSetupAccess()
  const context = await getMenuContext()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offers"
        description="Discounts you fund. You'll see exactly what each one leaves you before it runs."
        actions={
          <Button asChild size="sm">
            <Link href="/offers/create">
              <Plus className="size-4" />
              New offer
            </Link>
          </Button>
        }
      />
      <DiscountList currency={context.currency} />
    </div>
  )
}
