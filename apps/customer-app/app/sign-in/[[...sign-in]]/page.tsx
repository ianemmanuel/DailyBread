import type { Metadata } from "next"
import { SignIn } from "@clerk/nextjs"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to DailyBread to pick up where you left off.",
}

export default function SignInPage() {
  return (
    <div className="flex flex-1 justify-center py-10 sm:py-16">
      <SignIn fallback={<div className="h-136 w-full max-w-100 rounded-xl shimmer" />} />
    </div>
  )
}
