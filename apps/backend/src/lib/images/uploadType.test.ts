import { describe, it, expect } from "vitest"
import { resolveImageExtension, MAX_IMAGE_SIZE_BYTES } from "./uploadType"

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
