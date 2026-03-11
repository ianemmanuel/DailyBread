import { ReactNode } from "react"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { OnboardingNavbar } from "@/components/onboarding/layout"
import { OnboardingFooter } from "@/components/onboarding/layout"

interface Props {
  children: ReactNode
}

export const dynamic = "force-dynamic"

export default async function OnboardingLayout({ children }: Props) {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")
  const token = await getToken()
  if (!token) redirect("/sign-in")

  const res = await fetch(
    `${process.env.BACKEND_API_URL}/vendor/v1/application`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
    }
  )

  if (res.status === 401) redirect("/sign-in")

  const json = await res.json()
  const application = res.ok && json.status === "success" ? json.data : null

  return (
    <>
      <OnboardingNavbar />

      <div className="min-h-screen bg-background text-foreground flex flex-col">
        {/* Optional: step indicator can go here if you want it globally */}
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </div>

      <OnboardingFooter />
    </>
  )
}