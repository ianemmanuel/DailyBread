// app/onboarding/business-details/page.tsx
import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { BusinessDetailsForm } from "@/components/onboarding/business-details"
import { Alert, AlertDescription } from "@repo/ui/components/alert"
import { InfoIcon } from "lucide-react"
import { OnboardingStepIndicator } from "@/components/onboarding"
import { cache } from "react"
import type { Country, Application } from "@repo/types"
import { Button } from "@repo/ui/components/button"


const getCountries = cache(async (token: string): Promise<{ countries: Country[]; error: string | null }> => {
  try {
    const response = await fetch(`${process.env.BACKEND_API_URL}/meta/v1/countries`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      return { countries: [], error: "Failed to load countries" }
    }

    const json = await response.json()
    
    if (json.status === "success" && json.data) {
      return { countries: json.data.countries, error: null }
    }
    
    return { countries: [], error: json.message || "Failed to load countries" }
  } catch (error) {
    console.error("[getCountries] error:", error)
    return { countries: [], error: "Something went wrong loading countries" }
  }
})

const getApplication = cache(async (token: string): Promise<{ 
  application: Application | null; 
  hasDocuments: boolean; 
  error: string | null 
}> => {
  try {
    const response = await fetch(`${process.env.BACKEND_API_URL}/vendor/v1/application`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })

    if (response.status === 401) {
      redirect("/sign-in")
    }

    if (!response.ok) {
      //* 404 means no application yet - that's fine for new users
      if (response.status === 404) {
        return { application: null, hasDocuments: false, error: null }
      }
      return { application: null, hasDocuments: false, error: "Failed to load application" }
    }

    const json = await response.json()
    
    if (json.status === "success" && json.data) {
      const application = json.data
      const hasDocuments = application?.documents?.some(
        (d:any) => d.status !== "WITHDRAWN"
      ) ?? false
      
      return { application, hasDocuments, error: null }
    }
    
    return { application: null, hasDocuments: false, error: json.message || "Failed to load application" }
  } catch (error) {
    console.error("[getApplication] error:", error)
    //* Don't block the page for application errors - user can start fresh
    return { application: null, hasDocuments: false, error: null }
  }
})

export default async function BusinessDetailsPage() {
  const { userId, getToken } = await auth()
  
  if (!userId) redirect("/sign-in")
  
  const token = await getToken()
  if (!token) redirect("/sign-in")

  const [countriesResult, applicationResult] = await Promise.all([
    getCountries(token),
    getApplication(token),
  ])
  console.log(applicationResult.application)
  if (applicationResult.application && 
      !["DRAFT", "REJECTED"].includes(applicationResult.application.status)) {
    redirect("/onboarding")
  }

  if (countriesResult.error) {
    return (
      <>
        <div className="mb-8">
          <OnboardingStepIndicator application={applicationResult.application} />
        </div>
        <Alert variant="destructive" className="mb-4">
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>
            {countriesResult.error}. Please{" "}
            <Button 
              onClick={() => window.location.reload()}
              className="underline font-medium"
            >
              refresh the page
            </Button>{" "}
            to continue.
          </AlertDescription>
        </Alert>
      </>
    )
  }

  return (
    <>
      <div className="mb-8">
        <OnboardingStepIndicator application={applicationResult.application} />
      </div>

      <BusinessDetailsForm
        application={applicationResult.application}
        countries={countriesResult.countries}
        hasDocuments={applicationResult.hasDocuments}
      />
    </>
  )
}