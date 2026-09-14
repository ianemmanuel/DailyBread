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

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Cloudflare R2, both the S3-compatible endpoint and a custom r2.dev
      // subdomain, whichever the bucket ends up being served from.
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com", pathname: "/**" },
      { protocol: "https", hostname: "**.r2.dev", pathname: "/**" },
      ...extraHosts.map((hostname) => ({ protocol: "https", hostname, pathname: "/**" })),
    ],
    // Two quality levels only. Menu photography is the whole visual weight of
    // this app, so cards get a good one; hero images get the better one.
    qualities: [75, 90],
  },
}

export default nextConfig
