import type { Metadata } from "next"
import { SignUp } from "@clerk/nextjs"

export const metadata: Metadata = { title: "Create an account" }

/*
 * Creating an account fires the Clerk webhook that creates the ConsumerAccount
 * row (see the customer module's clerk webhook). Until that lands the backend
 * answers 503 CUSTOMER_ACCOUNT_PENDING rather than 401 — so the client retries
 * instead of bouncing someone back to a sign-in they just completed.
 */
export default function SignUpPage() {
  return (
    <div className="shell flex flex-col items-center gap-6 py-16">
      <div className="max-w-sm space-y-1.5 text-center">
        <h1 className="heading-lg text-[var(--foreground)]">Create your account</h1>
        <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
          You only need one to check out — browsing and building a basket work without it.
        </p>
      </div>
      <SignUp
        signInUrl="/sign-in"
        fallbackRedirectUrl="/"
        appearance={{ elements: { rootBox: "w-full flex justify-center" } }}
      />
    </div>
  )
}
