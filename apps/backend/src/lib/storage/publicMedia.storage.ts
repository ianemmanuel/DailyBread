import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

import { env } from "@/env"

/*
 * PUBLIC media storage — the bucket the world can read.
 *
 * WHY THIS IS A SEPARATE FILE AND A SEPARATE BUCKET
 *
 * `lib/r2/r2.service.ts` owns the PRIVATE bucket: identity documents, payout
 * proofs, menu photography. Everything there leaves as a short-lived signed
 * URL and nothing in it may ever be world-readable.
 *
 * R2 grants public access per BUCKET — attach a custom domain and the whole
 * bucket is readable. It has no per-object public flag and no per-prefix
 * switch, so "publish just this folder" is not a thing you can express. Making
 * a public prefix inside the private bucket would publish every document in
 * it. Hence: two buckets, two clients, two API tokens. A leaked public token
 * cannot read anything confidential, and writing a payout proof into the
 * public bucket would mean importing a different module by mistake rather
 * than mistyping a path.
 *
 * Objects written here are:
 *   - produced by THIS server (never a file a user uploaded, byte for byte),
 *   - named by uuid, so the path leaks nothing and nothing is enumerable,
 *   - immutable: a new version is a new key, so they can be cached for a year.
 *
 * ── On replacing R2 later (analysis only; no abstraction built yet) ─────────
 * Everything below is plain S3 API, so another S3-compatible store (Backblaze
 * B2, MinIO, Wasabi, Tigris, AWS S3) is an endpoint and credential change.
 * The things that would actually cost work on a move:
 *   1. `publicUrl()` — the public URL shape is provider-specific. It is the
 *      ONE place that mapping lives, which is why it is a function and why
 *      nothing outside this file ever concatenates a URL.
 *   2. Presigned PUT uploads (r2.service.ts) — S3-compatible everywhere, but
 *      CORS configuration is per provider and has to be re-done by hand.
 *   3. Stored values. The database keeps a storage KEY, never a URL, so a
 *      migration is re-pointing a base URL and not a data rewrite. Keep it
 *      that way: the moment a full URL is persisted, the store is welded in.
 * A shared `ObjectStore` interface over both buckets is the natural next step
 * when a second provider is real — deliberately not built for one provider.
 */

const CONFIG_HINT =
  "Public media storage is not configured. Set R2_PUBLIC_BUCKET_NAME, " +
  "R2_PUBLIC_ENDPOINT, R2_PUBLIC_ACCESS_KEY_ID, R2_PUBLIC_SECRET_ACCESS_KEY " +
  "and R2_PUBLIC_CDN_URL."

/** True once the bucket has been provisioned and its env filled in. */
export function isPublicMediaConfigured(): boolean {
  return Boolean(
    env.R2_PUBLIC_BUCKET_NAME &&
      env.R2_PUBLIC_ENDPOINT &&
      env.R2_PUBLIC_ACCESS_KEY_ID &&
      env.R2_PUBLIC_SECRET_ACCESS_KEY &&
      env.R2_PUBLIC_CDN_URL,
  )
}

/*
 * Built lazily rather than at import time. The env is optional by design, so
 * constructing a client at module load would either throw on boot for everyone
 * or silently build a broken one.
 */
let client: S3Client | null = null

function getClient(): S3Client {
  if (!isPublicMediaConfigured()) throw new Error(CONFIG_HINT)
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: env.R2_PUBLIC_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_PUBLIC_ACCESS_KEY_ID,
        secretAccessKey: env.R2_PUBLIC_SECRET_ACCESS_KEY,
      },
    })
  }
  return client
}

export const publicMediaStorage = {
  isConfigured: isPublicMediaConfigured,

  /** Throws with a usable message if the bucket has not been provisioned. */
  assertConfigured(): void {
    if (!isPublicMediaConfigured()) throw new Error(CONFIG_HINT)
  },

  /**
   * Writes an object the public can read.
   *
   * `immutable` is the whole reason these keys carry a uuid: the bytes at a
   * key never change, so the browser and the CDN may keep them for a year and
   * a replacement is simply a different key.
   *
   * `nosniff` stops a browser from second-guessing the content type we set —
   * the defence against a file that is a valid image AND valid markup.
   */
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await getClient().send(
      new PutObjectCommand({
        Bucket: env.R2_PUBLIC_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
        ContentDisposition: "inline",
      }),
    )
  },

  async delete(key: string): Promise<void> {
    await getClient().send(
      new DeleteObjectCommand({ Bucket: env.R2_PUBLIC_BUCKET_NAME, Key: key }),
    )
  },

  /**
   * The one place a stored key becomes a URL.
   *
   * Uses the CDN domain, never the S3 endpoint: the endpoint is an API host,
   * is not cached, and would tie every rendered page to Cloudflare's hostname.
   */
  publicUrl(key: string): string {
    if (!env.R2_PUBLIC_CDN_URL) throw new Error(CONFIG_HINT)
    return `${env.R2_PUBLIC_CDN_URL.replace(/\/+$/, "")}/${key}`
  },
}
