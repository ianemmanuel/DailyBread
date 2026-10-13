"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useClerk, useUser } from "@clerk/nextjs"
import { ShieldAlert, Clock, Ban, HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

const REASONS: Record<string, { icon: typeof ShieldAlert; title: string; description: string }> = {
  ADMIN_USER_NOT_FOUND: {
    icon: HelpCircle,
    title: "No admin account found",
    description:
      "We couldn't find an admin account for this email address. If you were invited, make sure you signed in with the exact email the invitation was sent to.",
  },
  ACCOUNT_NOT_ACTIVATED: {
    icon: Clock,
    title: "Account not activated yet",
    description:
      "Your admin account exists but hasn't been activated. This normally finishes within a minute of signing up — if it's been longer than that, ask an administrator to check your invitation.",
  },
  ACCOUNT_SUSPENDED: {
    icon: Ban,
    title: "Account suspended",
    description: "This admin account has been suspended. Contact your administrator for details.",
  },
  ACCOUNT_DEACTIVATED: {
    icon: Ban,
    title: "Account deactivated",
    description: "This admin account has been deactivated. Contact your administrator if you believe this is a mistake.",
  },
}

const DEFAULT_REASON = {
  icon: ShieldAlert,
  title: "We couldn't verify your access",
  description: "Something went wrong while checking your admin permissions. Try again, or contact your administrator if it persists.",
}

export default function UnauthorizedPage() {
  return (
    <Suspense fallback={<div className="admin-card p-8" />}>
      <UnauthorizedContent />
    </Suspense>
  )
}

function UnauthorizedContent() {
  const params = useSearchParams()
  const { signOut } = useClerk()
  const { user } = useUser()

  const code   = params.get("code") ?? ""
  const reason = REASONS[code] ?? DEFAULT_REASON
  const Icon   = reason.icon

  return (
    <div className="admin-card flex flex-col items-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
        <Icon className="h-6 w-6 text-warning" aria-hidden="true" />
      </div>

      <div className="space-y-1.5">
        <h1 className="font-display text-lg font-semibold text-foreground">{reason.title}</h1>
        <p className="text-sm text-muted-foreground">{reason.description}</p>
      </div>

      {user?.primaryEmailAddress?.emailAddress && (
        <p className="text-xs text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user.primaryEmailAddress.emailAddress}</span>
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => signOut({ redirectUrl: "/sign-in" })}
        >
          Sign out and try a different account
        </Button>
      </div>
    </div>
  )
}
