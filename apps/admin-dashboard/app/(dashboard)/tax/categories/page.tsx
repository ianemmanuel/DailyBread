import type { Metadata } from "next"
import { TaxCategoryCatalog } from "@/components/tax/TaxCategoryCatalog"

export const metadata: Metadata = { title: "Tax categories" }

export default function TaxCategoriesPage() {
  return <TaxCategoryCatalog />
}
