import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { notFound, redirect } from "next/navigation"
import type { Country, ApiSuccess } from "@repo/types/admin-app"


interface Props { params: Promise<{ countryId: string }> }

export const metadata = { title: " Country Details" }

async function getCountry(token: string, countryId: string): Promise<Country | null> {
  const res = await fetch(`${process.env.BACKEND_API_URL}/admin/v1/geography/countries/${countryId}`, {
      headers: { Authorization: `Bearer ${token}` },
      next   : { revalidate: 120 },
    })
  if (!res.ok) return null
  const { data }: ApiSuccess<Country> = await res.json()
  return data
}

export default async function CountryDetailsPage({ params }: Props) {

    const { getToken, userId } = await auth()
    
    if (!userId) redirect("/sign-in")
        
    const token = await getToken()
    const countryId = (await params).countryId
    const country = await getCountry(token!, countryId)
    if (!country) notFound()
  return (
    <div>{country.name}-{country.code}</div>
    
  )
}

