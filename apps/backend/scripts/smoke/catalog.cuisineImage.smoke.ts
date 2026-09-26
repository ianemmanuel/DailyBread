/*
 * Smoke test — cuisine imagery and the public cuisine catalogue, against the
 * DEV DATABASE and REAL R2.
 *
 * Does what the ERP does: presign, PUT the bytes over HTTPS, let the server
 * re-encode and publish the derivative, then FETCH THE PUBLIC URL ANONYMOUSLY
 * and check the bytes decode as a 512x512 WebP served immutable. That last
 * step is the point — every earlier step can succeed while the object is
 * still unreachable, and the failure would only ever show up as a broken tile
 * in a browser.
 *
 * Also covers the prefix guard, which is a security control: "process this
 * key" must not be a copy-anything-into-the-public-bucket primitive.
 *
 * Cleans up both objects and the row, and sweeps strays from an aborted
 * earlier run before it starts.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/catalog.cuisineImage.smoke.ts
 */
import sharp from "sharp"
import { prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"

import { ApiError } from "@/errors/ApiError"
import { publicMediaStorage } from "@/lib/storage/publicMedia.storage"
import { R2Service } from "@/lib/r2/r2.service"
import {
  getCuisineDetail,
  presignCuisineImageUpload,
  removeCuisineImage,
  setCuisineImage,
} from "@/modules/admin/services/admin.cuisineImage.service"
import { createFoodTag, listFoodTags } from "@/modules/admin/services/admin.foodTag.service"
import { listCustomerCuisines } from "@/modules/customer/services/customer.catalog.service"

const MARKER = "zz-smoke-cuisine"
/* Resolved at run time. A made-up id makes every auditService.log write fail
 * its foreign key — harmless, since audit writes never block a mutation, but
 * it buries the real output in stack traces. */
let ACTOR = ""

const GLOBAL_SCOPE: AdminScopeContext = {
  isGlobal: true, countryIds: [], cityIds: [], tier: "GLOBAL",
}
const COUNTRY_SCOPE: AdminScopeContext = {
  isGlobal: false, countryIds: ["some-country"], cityIds: [], tier: "COUNTRY",
}

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.error(`  FAIL ${label}`, detail ?? "") }
}

async function expectFailure(label: string, code: string, run: () => Promise<unknown>) {
  try {
    await run()
    check(`${label} — should have been refused`, false)
  } catch (err) {
    const actual = err instanceof ApiError ? err.code : `${(err as Error)?.name}`
    check(`${label} (${code})`, actual === code, `got ${actual}: ${(err as Error)?.message}`)
  }
}

async function sweep() {
  const { count } = await prisma.cuisine.deleteMany({
    where: { OR: [{ slug: { startsWith: MARKER } }, { name: { startsWith: "ZZ Smoke" } }] },
  })
  if (count) console.log(`  swept ${count} stray cuisine row(s) from an earlier run`)
}

/** A 1200px square PNG — comfortably over MIN_SOURCE_EDGE, and not already
 *  the output format, so the re-encode is actually exercised. */
async function sourceImage(): Promise<Buffer> {
  return sharp({
    create: { width: 1200, height: 1200, channels: 3, background: { r: 200, g: 90, b: 30 } },
  }).png().toBuffer()
}

async function main() {
  console.log("\n── cuisine imagery smoke ───────────────────────────────────\n")

  if (!publicMediaStorage.isConfigured()) {
    console.error("  SKIPPED — public media storage is not configured (R2_PUBLIC_*).")
    process.exitCode = 1
    return
  }

  const anyAdmin = await prisma.adminUser.findFirst({ select: { id: true } })
  if (!anyAdmin) {
    console.error("  SKIPPED — no admin user exists to attribute the audit entries to.")
    process.exitCode = 1
    return
  }
  ACTOR = anyAdmin.id

  await sweep()

  const cuisine = await prisma.cuisine.create({
    data: {
      code: `${MARKER}-code`,
      slug: `${MARKER}-slug`,
      name: "ZZ Smoke Cuisine",
      status: "ACTIVE",
    },
  })

  let publicKey: string | null = null
  let originalKey: string | null = null

  try {
    // ── 1. Scope: catalogue imagery is GLOBAL-only ───────────────────────
    await expectFailure(
      "a country-scoped admin cannot presign catalogue imagery",
      "SCOPE_FORBIDDEN",
      () => presignCuisineImageUpload("image/png", COUNTRY_SCOPE),
    )
    await expectFailure(
      "a country-scoped admin cannot publish catalogue imagery",
      "SCOPE_FORBIDDEN",
      () => setCuisineImage(cuisine.slug, { originalImageKey: "x" }, ACTOR, COUNTRY_SCOPE),
    )

    // ── 2. The prefix guard ──────────────────────────────────────────────
    /* Without this, "process this key" is a copy-anything primitive — an
     * admin could name a payout proof and have it published. */
    await expectFailure(
      "a key outside the cuisine prefix is refused",
      "INVALID_STORAGE_KEY",
      () => setCuisineImage(
        cuisine.slug,
        { originalImageKey: "payout-docs/bank/vendor-1/secret.pdf" },
        ACTOR, GLOBAL_SCOPE,
      ),
    )
    await expectFailure(
      "a traversing key is refused",
      "INVALID_STORAGE_KEY",
      () => setCuisineImage(
        cuisine.slug,
        { originalImageKey: "catalog/cuisine-originals/../../secret.png" },
        ACTOR, GLOBAL_SCOPE,
      ),
    )
    await expectFailure(
      "a nested key under the right prefix is refused",
      "INVALID_STORAGE_KEY",
      () => setCuisineImage(
        cuisine.slug,
        { originalImageKey: "catalog/cuisine-originals/a/b.png" },
        ACTOR, GLOBAL_SCOPE,
      ),
    )

    // ── 3. The real round trip ───────────────────────────────────────────
    const presigned = await presignCuisineImageUpload("image/png", GLOBAL_SCOPE)
    originalKey = presigned.storageKey
    check(
      "the presigned key sits under the cuisine originals prefix",
      originalKey.startsWith("catalog/cuisine-originals/"),
      originalKey,
    )

    const bytes = await sourceImage()
    const put = await fetch(presigned.uploadUrl, {
      method : "PUT",
      headers: { "Content-Type": "image/png" },
      body   : bytes,
    })
    check(`the presigned PUT succeeds (${put.status})`, put.ok)

    const published = await setCuisineImage(
      cuisine.slug,
      { originalImageKey: originalKey, imageAlt: "A flat orange test square" },
      ACTOR,
      GLOBAL_SCOPE,
    )

    check("the cuisine now reports an image", published.hasImage)
    check("and keeps the original for a re-crop", published.hasOriginal)
    check("the alt text is stored", published.image?.alt === "A flat orange test square")
    check("dimensions are the 512 square", published.image?.width === 512 && published.image?.height === 512)
    check("a blur placeholder was produced", Boolean(published.image?.blurDataUrl?.startsWith("data:image/webp;base64,")))

    const row = await prisma.cuisine.findUnique({
      where : { id: cuisine.id },
      select: { imageKey: true },
    })
    publicKey = row?.imageKey ?? null
    check("the public key sits under the cuisine prefix", Boolean(publicKey?.startsWith("catalog/cuisine/")))

    // ── 4. It is actually reachable, anonymously ─────────────────────────
    const url = published.image?.url
    check("a public URL was built", Boolean(url))

    const fetched = await fetch(url as string)
    check(`the public object is readable anonymously (${fetched.status})`, fetched.ok)
    check(
      "served as WebP",
      fetched.headers.get("content-type") === "image/webp",
      fetched.headers.get("content-type"),
    )
    check(
      "served immutable — safe because the key is a fresh uuid each time",
      (fetched.headers.get("cache-control") ?? "").includes("immutable"),
      fetched.headers.get("cache-control"),
    )

    const meta = await sharp(Buffer.from(await fetched.arrayBuffer())).metadata()
    check("the bytes decode as WebP", meta.format === "webp", meta.format)
    check("at 512 x 512", meta.width === 512 && meta.height === 512, `${meta.width}x${meta.height}`)

    // ── 5. The customer catalogue ────────────────────────────────────────
    const listed = (await listCustomerCuisines({ pageSize: 60 })).cuisines
    const mine = listed.find((c) => c.slug === cuisine.slug)
    check("the cuisine appears in the public catalogue", Boolean(mine))
    check("it carries its image URL", Boolean(mine?.image?.url))
    check(
      "the public payload is a NARROW allowlist",
      mine !== undefined &&
        /* `description` was added deliberately for the cuisine pages — widening
         * this list must always be a decision, never a side effect. */
        JSON.stringify(Object.keys(mine).sort()) === JSON.stringify(["description", "id", "image", "name", "slug"]),
      mine && Object.keys(mine).sort(),
    )
    /* The PUBLIC key is necessarily part of the public URL — that is what a
     * public object address is. What must never appear is the PRIVATE
     * original, which lives in the bucket holding payout proofs and identity
     * documents. */
    check(
      "the private original key never reaches the customer",
      originalKey !== null && !JSON.stringify(mine ?? {}).includes(originalKey),
    )
    check(
      "and neither does the originals prefix",
      !JSON.stringify(mine ?? {}).includes("cuisine-originals"),
    )

    // ── 6. A suspended cuisine leaves the catalogue ──────────────────────
    await prisma.cuisine.update({ where: { id: cuisine.id }, data: { status: "SUSPENDED" } })
    const afterSuspend = (await listCustomerCuisines({ pageSize: 60 })).cuisines
    check(
      "a suspended cuisine is not offered to customers",
      !afterSuspend.some((c) => c.slug === cuisine.slug),
    )
    await prisma.cuisine.update({ where: { id: cuisine.id }, data: { status: "ACTIVE" } })

    // ── 6b. Create, and the slug the ERP redirects on ────────────────────
    /* The create page sends the admin straight to /food-tags/cuisines/<slug>
     * /edit so the picture can be added while they are still thinking about
     * it. That redirect is only possible if create HANDS BACK the slug — if it
     * ever stopped doing so the page would navigate to /edit on an empty
     * segment and 404, which is exactly the kind of silent break a type does
     * not catch. */
    const madeName = "ZZ Smoke Created Cuisine"
    const made = await createFoodTag("CUISINE", { name: madeName }, ACTOR, GLOBAL_SCOPE)
    check("create returns an id", Boolean(made.id))
    check("create returns the SLUG the ERP redirects on", Boolean(made.slug), made.slug)
    check("and a stable code", Boolean(made.code), made.code)
    await prisma.cuisine.delete({ where: { id: made.id } })

    // ── 6c. Server-side pagination ───────────────────────────────────────
    const page1 = await listFoodTags("CUISINE", GLOBAL_SCOPE, { page: 1, pageSize: 10 })
    const page2 = await listFoodTags("CUISINE", GLOBAL_SCOPE, { page: 2, pageSize: 10 })
    check("a page holds at most 10 rows", page1.tags.length <= 10, page1.tags.length)
    check("pageSize is honoured, not silently defaulted", page1.pageSize === 10, page1.pageSize)
    check(
      "totalPages matches the total",
      page1.totalPages === Math.ceil(page1.total / 10),
      `${page1.totalPages} vs ${page1.total}/10`,
    )
    check(
      "page 2 holds different rows — the skip is real, not a client-side slice",
      page2.tags.length === 0 || !page1.tags.some((a) => page2.tags.some((b) => b.id === a.id)),
    )
    check(
      "every row carries the slug the details link is built from",
      page1.tags.every((t) => typeof t.slug === "string" && t.slug.length > 0),
    )

    // ── 7. Detail read, then removal ─────────────────────────────────────
    const detail = await getCuisineDetail(cuisine.slug)
    check("the detail read resolves by slug", detail.slug === cuisine.slug)
    check("and reports no countries yet", detail.countries.length === 0)
    /* The suspend confirmation says "the N vendors already using it keep it".
     * Without this number it would have to ask the admin to guess. */
    check("it carries vendorCount for the suspend confirmation", detail.vendorCount === 0, detail.vendorCount)
    check("and the status the header badge renders", detail.status === "ACTIVE", detail.status)

    const removed = await removeCuisineImage(cuisine.slug, ACTOR, GLOBAL_SCOPE)
    check("removing the image clears it", !removed.hasImage && removed.image === null)

    const gone = await fetch(url as string)
    check(`the public object is deleted (${gone.status})`, gone.status === 404)
    publicKey = null
  } finally {
    if (publicKey) await publicMediaStorage.delete(publicKey).catch(() => {})
    if (originalKey) await R2Service.deleteObject(originalKey).catch(() => {})
    await prisma.cuisine.deleteMany({
      where: { OR: [{ slug: { startsWith: MARKER } }, { name: { startsWith: "ZZ Smoke" } }] },
    })
    console.log("  cleaned up")
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
