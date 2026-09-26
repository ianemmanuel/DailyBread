import type { Metadata } from "next"
import { SignIn } from "@clerk/nextjs"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to DailyBread to pick up where you left off.",
}

export default function SignInPage() {
  return (
    <div className="flex flex-1 justify-center py-10 sm:py-16">
      <SignIn
        /* Used ONLY when Clerk has no `redirect_url` of its own — i.e. the
           customer came here from the navbar rather than from a page that
           needed them signed in. `/continue` then resolves their default
           address's market. `forceRedirectUrl` would override `redirect_url`
           and strand someone who signed in mid-task. */
        fallbackRedirectUrl="/continue"
        fallback={<div className="h-136 w-full max-w-100 rounded-xl shimmer" />} />
    </div>
  )
}
