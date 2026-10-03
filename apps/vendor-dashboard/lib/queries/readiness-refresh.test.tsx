// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/*
 * The go-live banner is rendered by the server LAYOUT, which a client
 * navigation never re-renders. Every write that changes readiness must
 * therefore refresh the server tree once it SUCCEEDS — and never when it
 * fails, which would be a wasted render at best.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

let fetchResult: () => Promise<unknown> = async () => ({})
vi.mock("@/lib/api/client", () => ({
  ClientApiError: class extends Error {},
  clientFetch: vi.fn(() => fetchResult()),
}))

import { usePublishProfile, useUnpublishProfile, useUpsertVendorProfile } from "./profile"
import { useAddPayoutAccount, useRemovePayoutAccount, useSetDefaultPayoutAccount } from "./payout"

type Mutation = { mutateAsync: (arg?: unknown) => Promise<unknown> }

async function run(useHook: () => unknown): Promise<void> {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  let mutation: Mutation | null = null
  function Probe() { mutation = useHook() as Mutation; return null }

  const root = createRoot(document.createElement("div"))
  await act(async () => {
    root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)
  })
  await act(async () => { await mutation!.mutateAsync().catch(() => undefined) })
  root.unmount()
}

const hooks: [string, () => unknown][] = [
  ["publish",             usePublishProfile],
  ["unpublish",           useUnpublishProfile],
  ["save profile",        useUpsertVendorProfile],
  ["add payout account",  useAddPayoutAccount],
  ["set default payout",  useSetDefaultPayoutAccount],
  ["remove payout",       useRemovePayoutAccount],
]

beforeEach(() => {
  refresh.mockClear()
  fetchResult = async () => ({})
})

describe("readiness refresh", () => {
  it.each(hooks)("%s refreshes the server-rendered layout after success", async (_name, useHook) => {
    await run(useHook)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it.each(hooks)("%s does not refresh when the write fails", async (_name, useHook) => {
    fetchResult = async () => { throw new Error("refused") }
    await run(useHook)
    expect(refresh).not.toHaveBeenCalled()
  })
})
