import type { Metadata } from "next"
import { FoodTagsCatalog } from "@/components/food-tags/FoodTagsCatalog"

export const metadata: Metadata = { title: "Cuisines" }

export default function CuisinesPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>
}) {
  return <FoodTagsCatalog kind="cuisines" searchParams={searchParams} />
}
