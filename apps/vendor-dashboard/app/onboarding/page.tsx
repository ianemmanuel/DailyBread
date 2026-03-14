import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Clock, FileText, AlertCircle, ArrowRight, Building2, CheckCircle2 } from 'lucide-react'
import { Button } from '@repo/ui/components/button'
import { Alert, AlertDescription } from '@repo/ui/components/alert'
import { Card, CardContent } from '@repo/ui/components/card'
import { OnboardingStepIndicator } from '@/components/onboarding'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const { getToken, userId } = await auth()
  if (!userId) redirect('/sign-in')
  const token = await getToken()
  if (!token) redirect('/sign-in')

  const res = await fetch(`${process.env.BACKEND_API_URL}/vendor/v1/application`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const json = await res.json()

  // No application yet — start at step 1
  if (!res.ok || json.status !== 'success') {
    redirect('/onboarding/business-details')
  }

  const application = json.data

  // Approved — go to dashboard
  if (application.status === 'APPROVED') {
    redirect('/dashboard')
  }

  // Draft — resume at the correct step
  if (application.status === 'DRAFT') {
    const hasDocuments = application.documents?.some(
      (d: { status: string }) => d.status !== 'WITHDRAWN'
    )
    redirect(hasDocuments ? '/onboarding/review' : '/onboarding/documents')
  }

  // SUBMITTED, UNDER_REVIEW, REJECTED — render the status hub
  return (
    <div className="space-y-6">

      <OnboardingStepIndicator application={application} />

      {/* Page heading */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-sm">
          <Building2 className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Vendor Application
          </h1>
          <p className="text-sm text-muted-foreground">DailyBread Vendor Portal</p>
        </div>
      </div>

      {/* SUBMITTED */}
      {application.status === 'SUBMITTED' && (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Clock className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">Application Submitted</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Your application has been submitted and is waiting to be reviewed by our team.
              We'll notify you by email once a decision has been made.
            </p>
            {application.submittedAt && (
              <div className="mt-6 rounded-xl bg-secondary/60 px-6 py-3 text-sm text-muted-foreground">
                Submitted on{' '}
                <span className="font-medium text-foreground">
                  {new Date(application.submittedAt).toLocaleDateString('en-KE', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* UNDER_REVIEW */}
      {application.status === 'UNDER_REVIEW' && (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/30">
              <FileText className="h-8 w-8 text-accent-foreground" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">Under Review</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Our team is currently reviewing your application and documents.
              This usually takes 2–3 business days. We'll reach out if we need anything.
            </p>
          </CardContent>
        </Card>
      )}

      {/* REJECTED */}
      {application.status === 'REJECTED' && (
        <Card className="border-destructive/30 shadow-sm">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">Application Not Approved</h2>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              Unfortunately your application was not approved. Please review the reason below,
              update your details and documents, and resubmit.
            </p>

            {(application.rejectionReason || application.revisionNotes) && (
              <Alert variant="destructive" className="mb-6 max-w-md text-left">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {application.rejectionReason && (
                    <p className="mb-1 font-medium">{application.rejectionReason}</p>
                  )}
                  {application.revisionNotes && (
                    <p className="text-sm">{application.revisionNotes}</p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Button asChild className="gap-2">
              <Link href="/onboarding/business-details">
                Revise Application
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

    </div>
  )
}