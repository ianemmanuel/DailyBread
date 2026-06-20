import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { SearchX } from "lucide-react"

import {
  Card,
  CardContent,
} from "@/components/ui/card"

import { Button } from "@/components/ui/button"

export default async function NotFound() {
  const { userId } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  return (
    <div
      className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4"
      style={{
        backgroundColor: "var(--background)",
      }}
    >
      <Card
        className="w-full max-w-md border"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <CardContent className="flex flex-col items-center p-10 text-center">
          <div
            className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border"
            style={{
              backgroundColor: "var(--muted)",
              borderColor: "var(--border)",
            }}
          >
            <SearchX
              className="h-10 w-10"
              style={{
                color: "var(--muted-foreground)",
              }}
            />
          </div>

          <div
            className="mb-2 text-5xl font-bold tabular-nums"
            style={{
              color: "var(--foreground)",
            }}
          >
            404
          </div>

          <h1
            className="font-display text-2xl font-semibold tracking-tight"
            style={{
              color: "var(--foreground)",
            }}
          >
            Page not found
          </h1>

          <p
            className="mt-3 max-w-sm text-sm leading-relaxed"
            style={{
              color: "var(--muted-foreground)",
            }}
          >
            The page you're looking for doesn't exist, may have been moved,
            or you might not have permission to access it.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/overview">
                Back to Dashboard
              </Link>
            </Button>

          </div>
        </CardContent>
      </Card>
    </div>
  )
}