// app/(onboarding)/business-details/page.tsx
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { cache } from 'react'
import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@repo/ui/components/alert'
import { BusinessDetailsForm } from '@/components/onboarding/business-details'
import { OnboardingStepIndicator } from '@/components/onboarding'
import type { Country, Application } from '@repo/types'

const getCountries = cache(async (token: string): Promise<{ countries: Country[]; error: string | null }> => {
  try {
    const res = await fetch(`${process.env.BACKEND_API_URL}/meta/v1/countries`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 3600 }, // countries rarely change
    })
    if (!res.ok) return { countries: [], error: 'Failed to load countries' }
    const json = await res.json()
    if (json.status === 'success' && json.data) return { countries: json.data.countries, error: null }
    return { countries: [], error: json.message || 'Failed to load countries' }
  } catch {
    return { countries: [], error: 'Something went wrong loading countries' }
  }
})

const getApplication = cache(async (token: string): Promise<{
  application: Application | null
  hasDocuments: boolean
  error: string | null
}> => {
  try {
    const res = await fetch(`${process.env.BACKEND_API_URL}/vendor/v1/application`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (res.status === 401) redirect('/sign-in')
    if (res.status === 404) return { application: null, hasDocuments: false, error: null }
    if (!res.ok) return { application: null, hasDocuments: false, error: 'Failed to load application' }

    const json = await res.json()
    if (json.status === 'success' && json.data) {
      const application = json.data
      const hasDocuments = application?.documents?.some((d: { status: string }) => d.status !== 'WITHDRAWN') ?? false
      return { application, hasDocuments, error: null }
    }
    return { application: null, hasDocuments: false, error: json.message || 'Failed to load application' }
  } catch {
    // Don't block on application errors — user can start fresh
    return { application: null, hasDocuments: false, error: null }
  }
})

export default async function BusinessDetailsPage() {
  const { userId, getToken } = await auth()
  if (!userId) redirect('/sign-in')
  const token = await getToken()
  if (!token) redirect('/sign-in')

  const [countriesResult, applicationResult] = await Promise.all([
    getCountries(token),
    getApplication(token),
  ])

  // If application is past editable state, redirect to status page
  if (applicationResult.application &&
      !['DRAFT', 'REJECTED'].includes(applicationResult.application.status)) {
    redirect('/onboarding')
  }

  if (countriesResult.error) {
    return (
      <>
        <OnboardingStepIndicator application={applicationResult.application} />
        <Alert variant="destructive">
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>
            {countriesResult.error}. Please refresh the page to continue.
          </AlertDescription>
        </Alert>
      </>
    )
  }

  return (
    <>
      <OnboardingStepIndicator application={applicationResult.application} />
      <BusinessDetailsForm
        application={applicationResult.application}
        countries={countriesResult.countries}
        hasDocuments={applicationResult.hasDocuments}
      />
    </>
  )
}