import { describe, it, expect } from "vitest"
import {
  assertOwnedProfileMediaKey,
  normalizeSingleKey,
  currentProfileKeys,
  resolveImageExtension,
  MAX_IMAGE_SIZE_BYTES,
} from "./vendor.profileMedia"

/*
 * Pure — no DB. These back the profile media presign / discard / save paths.
 *
 * assertOwnedProfileMediaKey is the security boundary of the whole feature:
 * the discard endpoint deletes whatever key it is handed, so if this function
 * is wrong that endpoint becomes a delete-anything primitive. Most of the
 * cases below exist to keep it honest.
 */

const VENDOR = "vendor-1"
const OTHER  = "vendor-2"
const key = (kind: string, vendorId: string, file = "abc.png") => `profile-media/${kind}/${vendorId}/${file}`

describe("assertOwnedProfileMediaKey", () => {
  it("accepts this vendor's own key for every media kind", () => {
    for (const kind of ["logo", "cover"]) {
      expect(assertOwnedProfileMediaKey(key(kind, VENDOR), VENDOR)).toBe(key(kind, VENDOR))
    }
  })

  it("refuses another vendor's key", () => {
    expect(() => assertOwnedProfileMediaKey(key("logo", OTHER), VENDOR)).toThrow()
  })

  it("refuses keys outside the profile-media prefix", () => {
    // The three that matter: another vendor's payout evidence, an application
    // document, and the bucket root.
    expect(() => assertOwnedProfileMediaKey(`payout-docs/bank-account/${VENDOR}/x.pdf`, VENDOR)).toThrow()
    expect(() => assertOwnedProfileMediaKey(`vendors/${VENDOR}/documents/t/x.pdf`, VENDOR)).toThrow()
    expect(() => assertOwnedProfileMediaKey("x.png", VENDOR)).toThrow()
  })

  it("refuses an unknown media kind", () => {
    expect(() => assertOwnedProfileMediaKey(key("documents", VENDOR), VENDOR)).toThrow()
    // "gallery" was a real kind until the profile gallery was removed. Keys
    // under that prefix must stop being accepted, or the discard endpoint
    // would still reach objects nothing references.
    expect(() => assertOwnedProfileMediaKey(key("gallery", VENDOR), VENDOR)).toThrow()
  })

  it("refuses path traversal and empty segments", () => {
    expect(() => assertOwnedProfileMediaKey(`profile-media/logo/${VENDOR}/../../x.png`, VENDOR)).toThrow()
    expect(() => assertOwnedProfileMediaKey(`profile-media//logo/${VENDOR}/x.png`, VENDOR)).toThrow()
    expect(() => assertOwnedProfileMediaKey(`profile-media/logo/${VENDOR}/`, VENDOR)).toThrow()
  })

  it("refuses extra path segments", () => {
    // A deeper path would let a key escape the one-file-per-prefix shape the
    // ownership check relies on.
    expect(() => assertOwnedProfileMediaKey(`profile-media/logo/${VENDOR}/sub/x.png`, VENDOR)).toThrow()
  })

  it("refuses a vendor id that merely starts with the caller's", () => {
    expect(() => assertOwnedProfileMediaKey(key("logo", `${VENDOR}-extra`), VENDOR)).toThrow()
  })

  it("refuses non-strings", () => {
    for (const bad of [undefined, null, 42, {}, []]) {
      expect(() => assertOwnedProfileMediaKey(bad, VENDOR)).toThrow()
    }
  })
})

describe("normalizeSingleKey", () => {
  it("treats empty, null and undefined as cleared", () => {
    for (const empty of [undefined, null, ""]) {
      expect(normalizeSingleKey(empty, VENDOR)).toBeNull()
    }
  })

  it("still enforces ownership on a supplied key", () => {
    expect(() => normalizeSingleKey(key("logo", OTHER), VENDOR)).toThrow()
  })
})

describe("currentProfileKeys", () => {
  it("is empty for a vendor with no profile yet", () => {
    expect(currentProfileKeys(null).size).toBe(0)
  })

  it("collects logo and cover, skipping unset ones", () => {
    const keys = currentProfileKeys({
      logoStorageKey : key("logo", VENDOR),
      coverStorageKey: null,
    })
    expect(keys.size).toBe(1)
    expect(keys.has(key("logo", VENDOR))).toBe(true)
  })
})

describe("resolveImageExtension", () => {
  it("maps each accepted image type to its extension", () => {
    expect(resolveImageExtension("image/jpeg", 1000)).toBe("jpg")
    expect(resolveImageExtension("image/png", 1000)).toBe("png")
    expect(resolveImageExtension("image/webp", 1000)).toBe("webp")
  })

  it("rejects PDF — accepted for documents, never for display images", () => {
    expect(() => resolveImageExtension("application/pdf", 1000)).toThrow()
  })

  it("rejects an oversized file", () => {
    expect(() => resolveImageExtension("image/png", MAX_IMAGE_SIZE_BYTES + 1)).toThrow()
  })

  it("rejects a missing or nonsense size", () => {
    for (const bad of [0, -1, NaN]) {
      expect(() => resolveImageExtension("image/png", bad)).toThrow()
    }
  })
})
