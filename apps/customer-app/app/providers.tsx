"use client"

import * as React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/*
 * One QueryClient per browser session — React.useState, never module scope,
 * which on the server would leak one visitor's cached data into another's
 * render.
 *
 * This boundary is deliberately thin. Almost everything below it is still a
 * Server Component; only the handful of pieces that genuinely need the client
 * (the cart, the location picker, the option sheet) say "use client"
 * themselves.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cart pricing is the main client query and must never be stale:
            // it is what the customer is about to be charged.
            staleTime: 0,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
