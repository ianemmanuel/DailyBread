import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import crypto from "node:crypto"

import { env } from "@/env"

const r2 = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId    : env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

const BUCKET = env.R2_BUCKET_NAME
const UPLOAD_EXPIRY = env.R2_UPLOAD_EXPIRY_SECONDS
const VIEW_EXPIRY   = env.R2_VIEW_EXPIRY_SECONDS

export const R2Service = {
  //* Keyed by vendorUserId. 
   
  generateStorageKey(
    vendorUserId  : string,
    documentTypeId: string,
    extension     : string
  ) {
    const uuid = crypto.randomUUID()

    return `vendors/${vendorUserId}/documents/${documentTypeId}/${uuid}.${extension}`
  },

  /*
   * Payout-account proof documents live under their own short, readable
   * prefix, grouped by WHAT KIND of payout account they prove:
   *
   *   payout-docs/bank-account/<vendorId>/<uuid>.pdf
   *   payout-docs/mobile-money/<vendorId>/<uuid>.jpg
   *
   * Deliberately different from generateStorageKey above:
   *   - keyed on the VENDOR ACCOUNT id (unique per vendor) rather than the
   *     vendorUser id — a payout account belongs to the business, and this
   *     is the id every admin surface already shows;
   *   - NOT country-scoped, matching how vendor application documents are
   *     stored (the vendor id already implies the country);
   *   - no documentTypeId segment — the method-type folder already says what
   *     the document is, and it keeps the path short.
   *
   * The filename stays a uuid rather than a fixed `document.pdf`: a vendor
   * whose account is rejected re-submits a new one, and every VendorDocument
   * row is versioned rather than overwritten. A fixed name would silently
   * destroy the previous proof — exactly the audit trail a manual
   * verification decision rests on.
   */
  generatePayoutProofKey(
    methodSlug: string,
    vendorId  : string,
    extension : string,
  ) {
    const uuid = crypto.randomUUID()
    const ext = extension ? `.${extension}` : ""

    return `payout-docs/${methodSlug}/${vendorId}/${uuid}${ext}`
  },

  /*
   * Vendor public-profile media, grouped by what the image is for:
   *
   *   profile-media/logo/<vendorId>/<uuid>.png
   *   profile-media/cover/<vendorId>/<uuid>.jpg
   *   profile-media/gallery/<vendorId>/<uuid>.webp
   *
   * The vendorId segment is load-bearing, not decoration: it is what lets the
   * discard endpoint prove a key belongs to the caller before deleting it
   * (see assertOwnedProfileMediaKey). Without it, "delete this key" would be
   * a delete-anything primitive.
   *
   * Keyed on the vendor ACCOUNT id for the same reason as the payout proofs —
   * the profile belongs to the business, not to one vendor user.
   */
  generateProfileMediaKey(
    kind     : string,
    vendorId : string,
    extension: string,
  ) {
    const uuid = crypto.randomUUID()
    const ext = extension ? `.${extension}` : ""

    return `profile-media/${kind}/${vendorId}/${uuid}${ext}`
  },

  /*
   * Menu photography:
   *
   *   meal-images/<vendorId>/<uuid>.jpg
   *
   * Keyed on the vendor account id, per explicit product direction, and NOT on
   * the outlet. A dish is authored once by the vendor and sold at any number of
   * its outlets (see MenuItem / Meal), so an outlet segment would either force
   * the same photo to be re-uploaded per branch or leave the key pointing at
   * whichever outlet happened to be first — both wrong.
   *
   * No kind segment either, unlike profile media: the main image and the
   * gallery are the same kind of thing here, and which one a key is currently
   * serving as is a property of the row, not of the object. That also means
   * promoting a gallery shot to the main image is a column change and never a
   * copy.
   *
   * The vendorId segment is load-bearing for the same reason it is on profile
   * media: it is what lets the discard endpoint prove a key belongs to the
   * caller before deleting it.
   */
  generateMealImageKey(vendorId: string, extension: string) {
    const uuid = crypto.randomUUID()
    const ext = extension ? `.${extension}` : ""

    return `meal-images/${vendorId}/${uuid}${ext}`
  },

  async generateUploadUrl(storageKey: string, contentType: string) {
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      ContentType: contentType,
    })

    return getSignedUrl(r2, command, {
      expiresIn: UPLOAD_EXPIRY,
    })
  },

  async generateViewUrl(storageKey: string) {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
    })

    return getSignedUrl(r2, command, {
      expiresIn: VIEW_EXPIRY,
    })
  },

  async deleteObject(storageKey: string) {
    await r2.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: storageKey,
      })
    )
  },

  async objectExists(storageKey: string) {
    try {
      await r2.send(
        new HeadObjectCommand({
          Bucket: BUCKET,
          Key: storageKey,
        })
      )
      return true
    } catch {
      return false
    }
  },
}