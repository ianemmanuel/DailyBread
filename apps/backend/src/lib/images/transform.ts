import sharp, { type Metadata } from "sharp"

/*
 * Image normalisation: take the bytes someone uploaded and produce bytes we
 * are willing to serve.
 *
 * RE-ENCODING IS THE SANITISER. This is the security point of the whole file,
 * not a side effect of resizing. Decoding an image and writing a fresh one:
 *   - drops EXIF, which on a phone photo contains the GPS coordinates where it
 *     was taken and the device that took it;
 *   - destroys polyglot files — a payload that is a valid JPEG *and* valid
 *     HTML/JS, which is dangerous the moment a browser is talked into sniffing
 *     it as markup;
 *   - discards colour-profile and metadata chunks that decoders have a long
 *     history of parsing badly.
 * Nothing a user uploaded is ever served byte-for-byte. Only output of this
 * file reaches the public bucket.
 *
 * Pure in the sense that matters: buffers in, buffers out. No network, no
 * database, no filesystem — so every rule below is unit-testable.
 */

/*
 * What an admin may upload. AVIF and WebP are accepted because there is no
 * reason to refuse someone who already has a modern file, but they are not
 * REQUIRED — the point of this module is that a plain JPEG off a camera is
 * fine and we do the conversion.
 *
 * SVG IS ABSENT ON PURPOSE AND MUST STAY ABSENT. SVG is a document format that
 * can carry script and external references; serving a user-supplied one from
 * our own domain is a cross-site-scripting hole. Next.js refuses to optimise
 * SVG by default for the same reason.
 */
export const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const

export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number]

/** What `sharp` reports for each format we accept, mapped to its MIME type.
 *  The DECODED format is the truth; a declared content type is just a claim. */
const SHARP_FORMAT_TO_MIME: Record<string, AllowedUploadMimeType> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heif: "image/avif",
}

/** 10 MB. Matches the document pipeline's ceiling. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/**
 * 40 megapixels, about 6000 x 6667.
 *
 * This is a DECOMPRESSION-BOMB guard and it is not the same limit as the byte
 * ceiling above: a 3 MB PNG can decode to several gigabytes of raw pixels and
 * take the process down long before any file-size check is consulted.
 */
export const MAX_INPUT_PIXELS = 40_000_000

/** The narrowest edge worth accepting. Below this an upscale is unavoidable
 *  and the hero would look soft on a retina screen. */
export const MIN_SOURCE_EDGE = 900

export class ImageRejected extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = "ImageRejected"
  }
}

export interface DerivedImage {
  buffer: Buffer
  width: number
  height: number
  contentType: "image/webp"
  byteSize: number
}

export interface NormalisedImage extends DerivedImage {
  /** A ~20px wide WebP as a data URI, for `placeholder="blur"`.
   *  A remote image cannot be statically imported, so this is the only way to
   *  get a blur-up — and it is stored, not computed per request. */
  blurDataUrl: string
  /** What the bytes actually were, whatever the upload claimed. */
  sourceMimeType: AllowedUploadMimeType
}

export interface SquareCropSpec {
  /** Output edge in pixels; the result is always exactly this, square. */
  edge: number
  /** WebP quality. 82 is the knee of the curve for photography — above it the
   *  file grows fast for differences nobody sees. */
  quality: number
}

/**
 * Reads an image's real format and size without decoding the whole thing.
 *
 * Every rejection here is a deliberate gate, and the caller should surface the
 * `code` rather than a generic failure — an admin who uploaded a 12 MB photo
 * needs to be told that, not "upload failed".
 */
export async function inspectImage(input: Buffer): Promise<{
  mimeType: AllowedUploadMimeType
  width: number
  height: number
}> {
  if (input.byteLength === 0) {
    throw new ImageRejected("The file is empty.", "EMPTY_FILE")
  }
  if (input.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImageRejected("Image is too large — the maximum size is 10MB.", "FILE_TOO_LARGE")
  }

  let meta: Metadata
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
  } catch {
    /* A failure to even read the header means it is not an image we can
     * handle, whatever its extension said. */
    throw new ImageRejected(
      "That file could not be read as an image. Upload a JPEG, PNG, WebP or AVIF.",
      "UNSUPPORTED_MEDIA_TYPE",
    )
  }

  const mimeType = meta.format ? SHARP_FORMAT_TO_MIME[meta.format] : undefined
  if (!mimeType) {
    throw new ImageRejected(
      "Unsupported image type — upload a JPEG, PNG, WebP or AVIF.",
      "UNSUPPORTED_MEDIA_TYPE",
    )
  }

  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (width <= 0 || height <= 0) {
    throw new ImageRejected("That image has no readable dimensions.", "UNSUPPORTED_MEDIA_TYPE")
  }
  if (width * height > MAX_INPUT_PIXELS) {
    throw new ImageRejected(
      "That image has too many pixels — keep it under 40 megapixels.",
      "IMAGE_TOO_LARGE",
    )
  }

  return { mimeType, width, height }
}

/**
 * Crops to a centred square of exactly `edge` pixels and encodes WebP.
 *
 * WebP rather than AVIF for the STORED derivative, deliberately. This file is
 * a master that Next's image optimiser reads and re-encodes per browser and
 * per width; AVIF is a delivery format that is slow to decode and would make
 * every one of those re-encodes more expensive for no gain. The visitor still
 * receives AVIF — Next produces it from this.
 *
 * `withoutEnlargement` is NOT set: the caller has already refused sources
 * below MIN_SOURCE_EDGE, so any resize here is a downscale, and silently
 * returning a smaller-than-asked image would break the fixed square contract.
 */
export async function toSquareWebp(
  input: Buffer,
  spec: SquareCropSpec,
): Promise<DerivedImage> {
  const buffer = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    /* Honour the camera's rotation flag before cropping, then drop it. Without
     * this a portrait phone photo crops sideways. */
    .rotate()
    .resize(spec.edge, spec.edge, { fit: "cover", position: "centre" })
    .webp({ quality: spec.quality, effort: 5 })
    .toBuffer()

  return {
    buffer,
    width: spec.edge,
    height: spec.edge,
    contentType: "image/webp",
    byteSize: buffer.byteLength,
  }
}

/** The tiny blurred stand-in shown while the real image loads. Kept under
 *  ~1 KB so it can live in a database column and be inlined into the HTML. */
export async function toBlurDataUrl(input: Buffer): Promise<string> {
  const buffer = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize(20, 20, { fit: "cover", position: "centre" })
    .webp({ quality: 45 })
    .toBuffer()

  return `data:image/webp;base64,${buffer.toString("base64")}`
}

/**
 * The whole pipeline for one square image: verify, crop, encode, and make the
 * blur placeholder.
 *
 * Callers pass the ORIGINAL bytes. Every derivative is produced from that same
 * original, never from another derivative — re-encoding a lossy file from
 * another lossy file is what visibly degrades an image.
 */
export async function normaliseSquareImage(
  input: Buffer,
  spec: SquareCropSpec,
): Promise<NormalisedImage> {
  const source = await inspectImage(input)

  if (Math.min(source.width, source.height) < MIN_SOURCE_EDGE) {
    throw new ImageRejected(
      `That image is too small — its shortest side must be at least ${MIN_SOURCE_EDGE}px.`,
      "IMAGE_TOO_SMALL",
    )
  }

  const [derived, blurDataUrl] = await Promise.all([
    toSquareWebp(input, spec),
    toBlurDataUrl(input),
  ])

  return { ...derived, blurDataUrl, sourceMimeType: source.mimeType }
}
