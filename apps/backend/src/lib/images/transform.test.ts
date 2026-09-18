import sharp from "sharp"
import { describe, expect, it } from "vitest"

import {
  ALLOWED_UPLOAD_MIME_TYPES,
  ImageRejected,
  MIN_SOURCE_EDGE,
  inspectImage,
  normaliseSquareImage,
  toBlurDataUrl,
  toSquareWebp,
} from "./transform"

/*
 * Fixtures are generated here rather than committed as binaries: the test then
 * states exactly what makes each input interesting, and there is no set of
 * opaque files to keep in the repo.
 */
async function photo(
  width: number,
  height: number,
  format: "jpeg" | "png" | "webp" | "avif" = "jpeg",
): Promise<Buffer> {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } },
  })
  if (format === "jpeg") return image.jpeg().toBuffer()
  if (format === "png") return image.png().toBuffer()
  if (format === "webp") return image.webp().toBuffer()
  return image.avif().toBuffer()
}

const SPEC = { edge: 400, quality: 80 } as const

describe("inspectImage", () => {
  it.each(["jpeg", "png", "webp", "avif"] as const)("accepts %s", async (format) => {
    const result = await inspectImage(await photo(1000, 1000, format))
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain(result.mimeType)
    expect(result).toMatchObject({ width: 1000, height: 1000 })
  })

  /*
   * The whole reason the declared content type is never trusted: this buffer
   * would arrive claiming `image/jpeg` from a presign request, and the bytes
   * are a text file.
   */
  it("refuses a file that only claims to be an image", async () => {
    await expect(inspectImage(Buffer.from("<html><script>alert(1)</script>"))).rejects.toThrow(
      ImageRejected,
    )
  })

  /* SVG can carry script. It must never be accepted, and sharp's own SVG
   * support is exactly why this is asserted rather than assumed. */
  it("refuses SVG", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><script>alert(1)</script></svg>',
    )
    await expect(inspectImage(svg)).rejects.toThrow(ImageRejected)
  })

  it("refuses an empty file", async () => {
    await expect(inspectImage(Buffer.alloc(0))).rejects.toThrow(ImageRejected)
  })

  it("reports the real format, not the extension the upload used", async () => {
    // A PNG that an upload would have called .jpg
    const result = await inspectImage(await photo(1000, 1000, "png"))
    expect(result.mimeType).toBe("image/png")
  })
})

describe("toSquareWebp", () => {
  it("always produces an exact square in WebP, whatever the source shape", async () => {
    const shapes: [number, number][] = [
      [2000, 1200],
      [1200, 2000],
      [1500, 1500],
    ]
    for (const [w, h] of shapes) {
      const out = await toSquareWebp(await photo(w, h), SPEC)
      const meta = await sharp(out.buffer).metadata()
      expect(meta).toMatchObject({ width: SPEC.edge, height: SPEC.edge, format: "webp" })
      expect(out).toMatchObject({ width: SPEC.edge, height: SPEC.edge, contentType: "image/webp" })
    }
  })

  /*
   * Re-encoding IS the sanitiser. A phone photo carries EXIF including the GPS
   * coordinates where it was taken; publishing that would leak a real
   * location. This asserts the output carries none of it.
   */
  it("strips EXIF, so an uploaded photo cannot leak where it was taken", async () => {
    const withExif = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: "#888" },
    })
      .withExif({ IFD0: { Copyright: "someone", Software: "a-camera" } })
      .jpeg()
      .toBuffer()

    expect((await sharp(withExif).metadata()).exif).toBeDefined()

    const out = await toSquareWebp(withExif, SPEC)
    expect((await sharp(out.buffer).metadata()).exif).toBeUndefined()
  })
})

describe("toBlurDataUrl", () => {
  it("returns a data URI small enough to store in a column", async () => {
    const blur = await toBlurDataUrl(await photo(2000, 2000))
    expect(blur.startsWith("data:image/webp;base64,")).toBe(true)
    expect(blur.length).toBeLessThan(1024)
  })
})

describe("normaliseSquareImage", () => {
  it("returns the derivative, its real source type and a placeholder", async () => {
    const result = await normaliseSquareImage(await photo(2000, 1400, "png"), SPEC)
    expect(result).toMatchObject({
      width: SPEC.edge,
      height: SPEC.edge,
      contentType: "image/webp",
      sourceMimeType: "image/png",
    })
    expect(result.byteSize).toBeGreaterThan(0)
    expect(result.blurDataUrl.startsWith("data:image/webp;base64,")).toBe(true)
  })

  /* Upscaling a small source is what makes a hero look soft on a retina
   * screen, so it is refused rather than silently enlarged. */
  it("refuses a source whose shortest side is below the minimum", async () => {
    await expect(
      normaliseSquareImage(await photo(MIN_SOURCE_EDGE - 1, 4000), SPEC),
    ).rejects.toThrow(ImageRejected)
  })

  it("accepts a source exactly at the minimum", async () => {
    await expect(
      normaliseSquareImage(await photo(MIN_SOURCE_EDGE, MIN_SOURCE_EDGE), SPEC),
    ).resolves.toBeDefined()
  })

  it("carries a machine-readable reason, so the admin is told what to fix", async () => {
    await expect(normaliseSquareImage(Buffer.from("not an image"), SPEC)).rejects.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
    })
    await expect(normaliseSquareImage(await photo(300, 300), SPEC)).rejects.toMatchObject({
      code: "IMAGE_TOO_SMALL",
    })
  })
})
