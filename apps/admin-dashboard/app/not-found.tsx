import Link    from "next/link"
import { auth } from "@clerk/nextjs/server"
import { Button } from "@repo/ui/components/button"


export default async function NotFound() {
  const { userId } = await auth()
  const isSignedIn = !!userId

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">

      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-muted">
        <span
          className="font-display text-4xl font-semibold select-none"
          style={{ color: "var(--muted-foreground)" }}
        >
          404
        </span>
      </div>

      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        Page not found
      </h1>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">
        The page you're looking for doesn't exist, was moved, or you may not have
        permission to access it.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        {isSignedIn ? (
          <Button asChild>
            <Link href="/overview">Back to Overview</Link>
          </Button>
        ) : (
          <>
            <Button asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/">Home</Link>
            </Button>
          </>
        )}
      </div>

    </div>
  )
}