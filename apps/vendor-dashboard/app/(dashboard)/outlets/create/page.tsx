import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { PageGrid } from "@/components/dashboard/layout/DashboardShell"
import { CreateOutletForm } from "@/components/outlets/CreateOutletForm"
import { City } from "@/types/outlet"


const BACKEND = process.env.BACKEND_API_URL

async function getCities(token: string): Promise<City[]> {
  try {
    const res = await fetch(`${BACKEND}/vendor/v1/cities`, {
      headers: { Authorization: `Bearer ${token}` },
      next   : { revalidate: 3600 },           // cities rarely change
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.data ?? []
  } catch {
    return []
  }
}

export default async function OutletCreatePage() {
  const { getToken } = await auth()
  const token = await getToken()
  if (!token) redirect("/sign-in")

  const cities = await getCities(token)

  return (
    <PageGrid>
      <PageHeader
        title="New Outlet"
        description="Add a new kitchen location to your account."
      />

      {/* Max-width keeps the form readable on wide screens */}
      <div className="mx-auto w-full max-w-2xl">
        <CreateOutletForm cities={cities} />
      </div>
    </PageGrid>
  )
}