import type { Metadata } from "next"
import { SignUp } from "@clerk/nextjs"

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a DailyBread account to order from great local kitchens and build a weekly meal plan.",
}

export default function SignUpPage() {
  return (
    <div className="flex flex-1 justify-center py-10 sm:py-16">
      <SignUp
        /* Used ONLY when Clerk has no `redirect_url` of its own — i.e. the
           customer came here from the navbar rather than from a page that
           needed them signed in. `/continue` then resolves their default
           address's market. `forceRedirectUrl` would override `redirect_url`
           and strand someone who signed in mid-task. */
        fallbackRedirectUrl="/continue"
        fallback={<div className="h-152 w-full max-w-100 rounded-xl shimmer" />} />
    </div>
  )
}
