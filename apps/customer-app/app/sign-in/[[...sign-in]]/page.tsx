import type { Metadata } from "next"
import { SignIn } from "@clerk/nextjs"

export const metadata: Metadata = { title: "Sign in" }

/*
 * Signing in is entirely optional until checkout, so this page is reached
 * deliberately rather than being somewhere people get bounced to. The copy says
 * why it is worth doing rather than presenting it as a toll gate.
 */
export default function SignInPage() {
  return (
    <div className="shell flex flex-col items-center gap-6 py-16">
      <div className="max-w-sm space-y-1.5 text-center">
        <h1 className="heading-lg text-[var(--foreground)]">Welcome back</h1>
        <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
          Sign in to save addresses, check out faster and keep your order history.
        </p>
      </div>
      <SignIn
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
        appearance={{ elements: { rootBox: "w-full flex justify-center" } }}
      />
    </div>
  )
}
