/**
 * Image hosts.
 *
 * Menu photography and storefront media come back from the backend as SHORT-
 * LIVED SIGNED URLs on a private R2 bucket — the bucket is never public, so
 * there is no stable CDN host to hardcode. The account subdomain differs per
 * environment, which is why the host is read from the env rather than pinned:
 * set NEXT_PUBLIC_IMAGE_HOSTS to a comma-separated list when the R2 values are
 * filled in.
 *
 * next/image caches the OPTIMISED result, so a signature expiring afterwards
 * does not break an already-rendered page; the query string is part of the
 * cache key, so a refreshed signature simply re-optimises once.
 */
const extraHosts = (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean)

/*
 * The public media host. Marketing imagery lives in a SEPARATE, public R2
 * bucket served from a custom domain that differs per environment, so it is
 * read from the env rather than pinned. Set NEXT_PUBLIC_MEDIA_HOST to that
 * domain (e.g. img.dailybread.com).
 */
const mediaHost = (process.env.NEXT_PUBLIC_MEDIA_HOST ?? "").trim()

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    /*
     * AVIF first, WebP as the fallback, original as the last resort. Next
     * negotiates per request from the browser's Accept header, so nothing
     * breaks on an old client.
     *
     * AVIF is roughly 20-30% smaller than WebP at matched quality and about
     * half the size of JPEG, which matters most for the hero — it is the LCP
     * element on the landing page. It costs more CPU to ENCODE, but that is
     * paid once per (image, width, quality) and then cached, not per request.
     */
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      ...(mediaHost ? [{ protocol: "https", hostname: mediaHost, pathname: "/**" }] : []),
      // Cloudflare R2, both the S3-compatible endpoint and a custom r2.dev
      // subdomain, whichever the bucket ends up being served from.
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com", pathname: "/**" },
      { protocol: "https", hostname: "**.r2.dev", pathname: "/**" },
      ...extraHosts.map((hostname) => ({ protocol: "https", hostname, pathname: "/**" })),
      // Static placeholder photography for the landing page, until its content
      // comes from the ERP. Remove once no component references Pexels.
      { protocol: "https", hostname: "images.pexels.com", pathname: "/photos/**" },
    ],
    // Two quality levels only. Menu photography is the whole visual weight of
    // this app, so cards get a good one; hero images get the better one.
    qualities: [75, 90],
  },
}

export default nextConfig
