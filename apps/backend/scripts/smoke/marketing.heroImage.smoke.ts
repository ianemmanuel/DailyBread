/*
 * Smoke test — the hero IMAGE round trip, against REAL Cloudflare R2.
 *
 * This is the one path the other marketing smoke test deliberately skips,
 * because it needs both buckets provisioned. It exercises exactly what the ERP
 * does, in the same order:
 *
 *   presign  -> PUT the bytes to the PRIVATE bucket over HTTPS
 *            -> create the promotion with that key
 *            -> the server fetches, re-encodes and writes a square WebP to the
 *               PUBLIC bucket
 *            -> GET that public URL anonymously and check the bytes came back
 *
 * The last step is the point. Everything before it can succeed while the
 * object is still unreachable — wrong endpoint, wrong public origin, bucket
 * not actually public — and the failure only ever shows up as a broken image
 * in a browser.
 *
 * WHAT THIS CANNOT COVER: the browser's CORS preflight on the presigned PUT.
 * Node does not send one. If the ERP upload fails in a browser while this
 * passes, the bucket's CORS policy is what to fix.
 *
 * Cleans up after itself: both objects and the row.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/marketing.heroImage.smoke.ts
 */
import sharp from "sharp"
import { prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"

import { R2Service } from "@/lib/r2/r2.service"
import { publicMediaStorage } from "@/lib/storage/publicMedia.storage"
import {
  createHeroPromotion,
  presignHeroImageUpload,
  publishHeroPromotion,
  resolveHeroPromotionFor,
} from "@/modules/marketing/services/heroPromotion.service"

const MARKER = "[smoke] hero image"

const GLOBAL_SCOPE: AdminScopeContext = {
  isGlobal: true,
  countryIds: [],
  cityIds: [],
  tier: "GLOBAL",
}

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}`, detail ?? "")
  }
}

/** A real photograph-shaped JPEG, not a 1x1: the pipeline enforces a minimum
 *  source edge, and a gradient gives the encoder something to actually do. */
async function makeSourceJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 2000,
      height: 2000,
      channels: 3,
      background: { r: 253, g: 154, b: 76 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer()
}

async function main() {
  console.log("marketing / hero image round trip — smoke\n")

  if (!publicMediaStorage.isConfigured()) {
    console.error(
      "Public media storage is not configured. Fill the R2_PUBLIC_* values in .env first.",
    )
    process.exitCode = 1
    return
  }

  /* Sweep strays from an aborted earlier run before starting. */
  const swept = await prisma.heroPromotion.deleteMany({
    where: { headline: { startsWith: MARKER } },
  })
  if (swept.count) console.log(`  swept ${swept.count} stray row(s)\n`)

  const admin = await prisma.adminUser.findFirst({ select: { id: true } })
  if (!admin) {
    console.error("Need at least one AdminUser in the dev DB. Aborting.")
    process.exitCode = 1
    return
  }

  let promotionId: string | null = null
  let originalKey: string | null = null
  let publicKey: string | null = null

  try {
    /* ── 1. presign ─────────────────────────────────────────────────────── */
    const { uploadUrl, storageKey } = await presignHeroImageUpload({
      contentType: "image/jpeg",
      fileSize: 1_000_000,
    })
    originalKey = storageKey
    check("presign returns a key under the hero-originals prefix", {
      ok: storageKey.startsWith("marketing/hero-originals/"),
    }.ok)
    check("presign returns an https upload URL", uploadUrl.startsWith("https://"))

    /* ── 2. PUT the bytes, exactly as the browser does ──────────────────── */
    const source = await makeSourceJpeg()
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: new Uint8Array(source),
    })
    check(`uploads to the private bucket (HTTP ${put.status})`, put.ok, await safeText(put))
    if (!put.ok) return

    /* ── 3. the server processes it into the public bucket ──────────────── */
    const promotion = await createHeroPromotion(
      {
        scope: "GLOBAL",
        headline: `${MARKER} round trip`,
        originalImageKey: storageKey,
        imageAlt: "A flat orange test square",
      },
      admin.id,
      GLOBAL_SCOPE,
    )
    promotionId = promotion.id

    check("the promotion has a public image URL", Boolean(promotion.image?.url))
    check(
      "the derivative is square at the configured edge",
      promotion.image?.width === 1600 && promotion.image?.height === 1600,
      { width: promotion.image?.width, height: promotion.image?.height },
    )
    check(
      "a blur placeholder was stored with it",
      typeof promotion.image?.blurDataUrl === "string" &&
        promotion.image.blurDataUrl.startsWith("data:image/"),
    )

    const row = await prisma.heroPromotion.findUniqueOrThrow({
      where: { id: promotion.id },
      select: { imageKey: true, originalImageKey: true },
    })
    publicKey = row.imageKey
    check("the public key is under the hero prefix", Boolean(row.imageKey?.startsWith("marketing/hero/")))
    check("the original is kept for a future re-crop", row.originalImageKey === storageKey)
    check(
      "the public key is NOT the original key",
      row.imageKey !== row.originalImageKey,
      { imageKey: row.imageKey },
    )

    /* ── 4. THE POINT: fetch it anonymously over the public origin ──────── */
    const url = promotion.image!.url
    const res = await fetch(url)
    check(`the public URL serves the image (HTTP ${res.status})`, res.ok, url)
    check(
      "served as WebP",
      res.headers.get("content-type") === "image/webp",
      res.headers.get("content-type"),
    )
    check(
      "served immutable, cacheable for a year",
      (res.headers.get("cache-control") ?? "").includes("immutable"),
      res.headers.get("cache-control"),
    )
    if (res.ok) {
      const bytes = Buffer.from(await res.arrayBuffer())
      const meta = await sharp(bytes).metadata()
      check(
        "the bytes decode as a 1600x1600 image",
        meta.width === 1600 && meta.height === 1600,
        { width: meta.width, height: meta.height },
      )
      /* Re-encoding is the SANITISER: the original was a JPEG, so anything the
       * server serves must not be. */
      check("re-encoded rather than passed through", meta.format === "webp", meta.format)
    }

    /* ── 5. and the storefront resolves it ──────────────────────────────── */
    await publishHeroPromotion(promotion.id, {}, admin.id, GLOBAL_SCOPE)
    const resolved = await resolveHeroPromotionFor({ cityId: null, countryId: null })
    check(
      "a visitor with no location resolves this promotion",
      resolved?.headline === promotion.headline,
      resolved?.headline,
    )
    check("and it carries the public image URL", resolved?.image?.url === url)
  } finally {
    if (promotionId) {
      await prisma.heroPromotion.delete({ where: { id: promotionId } }).catch(() => null)
    }
    if (publicKey) await publicMediaStorage.delete(publicKey).catch(() => null)
    if (originalKey) await R2Service.deleteObject(originalKey).catch(() => null)
    console.log("\n  cleaned up")
  }

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300)
  } catch {
    return "<no body>"
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
