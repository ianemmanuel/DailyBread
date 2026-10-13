"use client"

import * as React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/*
 * One QueryClient per browser session (React.useState, not module scope) —
 * module scope would leak cached data across admins during SSR. Scoped
 * narrowly to the vendor-applications review workflow for now (e.g. the
 * action-reasons dropdown) — list/detail pages stay Server Components
 * fetching through Next's own cache, so this isn't a second cache for the
 * same data.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
