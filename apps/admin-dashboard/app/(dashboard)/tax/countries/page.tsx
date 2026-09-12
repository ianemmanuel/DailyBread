import type { Metadata } from "next"
import { CountryTaxManager } from "@/components/tax/CountryTaxManager"

export const metadata: Metadata = { title: "Country tax" }

export default function CountryTaxPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>
}) {
  return <CountryTaxManager searchParams={searchParams} />
}
