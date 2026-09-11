import type { Metadata } from "next"
import { FoodTagsCatalog } from "@/components/food-tags/FoodTagsCatalog"

export const metadata: Metadata = { title: "Dietary tags" }

export default function DietaryTagsPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>
}) {
  return <FoodTagsCatalog kind="dietary-tags" searchParams={searchParams} />
}
