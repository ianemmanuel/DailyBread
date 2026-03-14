// app/(onboarding)/review/page.tsx
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ReviewForm } from '@/components/onboarding/review'
import { OnboardingStepIndicator } from '@/components/onboarding'
import { Alert, AlertDescription } from '@repo/ui/components/alert'
import { InfoIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ReviewPage() {
  const { getToken, userId } = await auth()
  if (!userId) redirect('/sign-in')
  const token = await getToken()
  if (!token) redirect('/sign-in')

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  // Fetch application first — need the ID for the preview request
  const appRes  = await fetch(`${process.env.BACKEND_API_URL}/vendor/v1/application`, { method: 'GET', headers, cache: 'no-store' })
  const appJson = await appRes.json()

  if (!appRes.ok || appJson.status !== 'success') redirect('/onboarding/business-details')

  const application = appJson.data
  if (application.status !== 'DRAFT' && application.status !== 'REJECTED') redirect('/onboarding')

  // Fetch full preview (sequential — depends on application.id)
  const previewRes  = await fetch(`${process.env.BACKEND_API_URL}/vendor/v1/application/${application.id}/preview`, { method: 'GET', headers, cache: 'no-store' })
  const previewJson = await previewRes.json()

  if (!previewRes.ok || previewJson.status !== 'success') {
    return (
      <>
        <OnboardingStepIndicator application={application} />
        <Alert variant="destructive">
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>
            Failed to load your application preview. Please go back and try again.
          </AlertDescription>
        </Alert>
      </>
    )
  }

  const {
    application: fullApplication,
    requirements = [],
    progress,
    canSubmit = false,
  } = previewJson.data ?? {}

  if (!fullApplication || !progress) {
    return (
      <>
        <OnboardingStepIndicator application={application} />
        <Alert variant="destructive">
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>
            Failed to load your application. Please go back and try again.
          </AlertDescription>
        </Alert>
      </>
    )
  }

  return (
    <>
      <OnboardingStepIndicator application={fullApplication} />
      <ReviewForm
        application={fullApplication}
        requirements={requirements}
        progress={progress}
        canSubmit={canSubmit}
      />
    </>
  )
}