import { describe, it, expect, vi, beforeEach } from "vitest"
import { createRequire } from "node:module"

/*
 * Two things are pinned here.
 *
 * 1. Next's OWN semantics, read from next@16's code rather than assumed: a
 *    named profile ("default") only marks a tag stale, so an entry written
 *    before the mutation is still served; `{ expire: 0 }` makes it a miss. If
 *    a Next upgrade changes either, this fails before a vendor sees stale data.
 * 2. That expireTags hands Next the immediate form.
 */

const require = createRequire(import.meta.url)
const { default: FileSystemCache } = require("next/dist/server/lib/incremental-cache/file-system-cache") as {
  default: new (ctx: Record<string, unknown>) => { revalidateTag(tags: string[], durations?: { expire?: number }): Promise<void> }
}
const { areTagsExpired, areTagsStale, tagsManifest } = require(
  "next/dist/server/lib/incremental-cache/tags-manifest.external",
) as {
  areTagsExpired: (tags: string[], ts: number) => boolean
  areTagsStale  : (tags: string[], ts: number) => boolean
  tagsManifest  : Map<string, unknown>
}

const INFINITE_CACHE = 0xfffffffe // next/dist/lib/constants INFINITE_CACHE, the "default" profile's expire

describe("Next 16 tag invalidation semantics", () => {
  const cache = new FileSystemCache({ fs: {}, flushToDisk: false, serverDistDir: "", revalidatedTags: [] })
  beforeEach(() => tagsManifest.clear())

  it('a named profile like "default" leaves an earlier entry stale but NOT expired — it is still served', async () => {
    const writtenAt = Date.now() - 1_000
    await cache.revalidateTag(["t"], { expire: INFINITE_CACHE })
    expect(areTagsStale(["t"], writtenAt)).toBe(true)
    expect(areTagsExpired(["t"], writtenAt)).toBe(false)
  })

  it("{ expire: 0 } expires an earlier entry — the next read is a miss", async () => {
    const writtenAt = Date.now() - 1_000
    await cache.revalidateTag(["t"], { expire: 0 })
    expect(areTagsExpired(["t"], writtenAt)).toBe(true)
  })
})

const revalidateTag = vi.fn()
vi.mock("next/cache", () => ({ revalidateTag: (...args: unknown[]) => revalidateTag(...args) }))

describe("expireTags", () => {
  beforeEach(() => revalidateTag.mockClear())

  it("expires every tag immediately", async () => {
    const { expireTags } = await import("./expire")
    expireTags("a", "b")
    expect(revalidateTag.mock.calls).toEqual([["a", { expire: 0 }], ["b", { expire: 0 }]])
  })
})
