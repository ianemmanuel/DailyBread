import type { Metadata } from "next"
import Link from "next/link"
import { Plus } from "lucide-react"
import type { HeroPromotionList } from "@repo/types/admin-app"

import { HeroPromotionsTable } from "@/components/marketing/HeroPromotionsTable"
import { Button } from "@/components/ui/button"
import { adminFetch } from "@/lib/api"

export const metadata: Metadata = { title: "Hero promotions" }

/*
 * A Server Component — the list is fetched with the admin's own token and the
 * backend narrows it to their scope, so a city lead never receives another
 * country's rows to begin with.
 *
 * The three outcomes are distinguished deliberately: a failed request must not
 * look like an empty list.
 */
export default async function MarketingPage() {
  let data: HeroPromotionList | null = null
  let error: string | null = null

  try {
    data = await adminFetch<HeroPromotionList>(
      "/admin/v1/marketing/hero-promotions?page=1&pageSize=50",
      { cache: "no-store" },
    )
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load promotions"
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Hero promotions</h1>
          <p className="text-sm text-muted-foreground">
            What the storefront shows in its hero card. A visitor sees their
            city&apos;s promotion, then their country&apos;s, then the global default.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/marketing/new">
            <Plus className="size-4" />
            New promotion
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="admin-card py-10 text-center">
          <p className="text-sm font-medium">Could not load promotions</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      ) : (
        <HeroPromotionsTable promotions={data?.items ?? []} />
      )}
    </div>
  )
}
