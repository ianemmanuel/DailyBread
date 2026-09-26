import Link from "next/link"
import { AlertTriangle, Clock, ShieldOff } from "lucide-react"

import { Button } from "@/components/ui/button"

/*
 * The three ways the account screen can answer other than "here you are".
 *
 * Each says what actually happened, because all three are genuinely different
 * and only one of them is a fault.
 */

function Panel({
  icon, title, body, children,
}: {
  icon     : React.ReactNode
  title    : string
  body     : string
  children?: React.ReactNode
}) {
  return (
    <div className="surface mx-auto max-w-lg px-6 py-12 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-subtle">
        {icon}
      </div>
      <h1 className="heading-md mt-5 text-foreground">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
      {children && <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  )
}

/**
 * Signed in, but the account row has not been created yet.
 *
 * The identity provider confirms the person the instant they sign up; OUR row
 * arrives by webhook a moment later. The backend answers 503 rather than 401
 * for exactly this window, so the only correct thing to show is "nearly
 * there" — an error here would be a lie about a system working normally.
 */
export function AccountPending() {
  return (
    <Panel
      icon={<Clock className="size-6 text-primary-subtle-fg" />}
      title="Setting up your account"
      body="You're signed in — we're just finishing your profile. This usually takes a second."
    >
      {/* A plain link, so the retry is a fresh request rather than a cached
          render of the same answer. */}
      <Button asChild className="h-11 rounded-full px-6">
        <a href="/account">Try again</a>
      </Button>
    </Panel>
  )
}

export function AccountSuspended({ message }: { message: string }) {
  return (
    <Panel
      icon={<ShieldOff className="size-6 text-primary-subtle-fg" />}
      title="This account is suspended"
      body={message}
    >
      <Button asChild variant="brand" className="h-11 rounded-full px-6">
        <Link href="/">Back to DailyBread</Link>
      </Button>
    </Panel>
  )
}

export function AccountError({ message }: { message: string }) {
  return (
    <div className="surface mx-auto max-w-lg border-destructive/30 px-6 py-12 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive-bg">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <h1 className="heading-md mt-5 text-foreground">We couldn&apos;t load your account</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {message} This is a problem on our side — please try again shortly.
      </p>
    </div>
  )
}
