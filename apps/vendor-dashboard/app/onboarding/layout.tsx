import { ReactNode } from 'react'
import { OnboardingNavbar } from '@/components/onboarding/layout'
import { OnboardingFooter } from '@/components/onboarding/layout'

/*
  ONBOARDING LAYOUT — SERVER COMPONENT

  Auth is not checked here. Each sub-page (business-details, documents, review)
  runs its own auth() + fetch independently, which is correct because:
  - They each need different data from the backend anyway
  - Checking auth in the layout AND each page would hit Clerk twice per request
  - Next.js deduplicates auth() calls within a request via React cache, but
    the application fetch here was not cached and was being thrown away unused

  The previous version fetched /vendor/v1/application on every layout render
  and then never used the result — the application data cannot be passed to
  children from a layout. That fetch has been removed entirely.
*/
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OnboardingNavbar />

      {/*
        max-w-3xl gives BusinessDetailsForm enough room for its 3-column grid
        without needing the negative-margin breakout hack that was in the form.
        Onboarding pages are intentionally narrower than the dashboard (max-w-7xl)
        — forms need focus, not breadth.
      */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>

      <OnboardingFooter />
    </div>
  )
}