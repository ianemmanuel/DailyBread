/*
 * The public media host, read from the env rather than pinned.
 *
 * Marketing imagery lives in a SEPARATE, public R2 bucket served from a custom
 * domain, which differs per environment — so the hostname cannot be hardcoded.
 * Set NEXT_PUBLIC_MEDIA_HOST to that domain (e.g. img.dailybread.com). Until
 * the bucket is provisioned this is simply absent and no promotion has an
 * image to render.
 */
const mediaHost = (process.env.NEXT_PUBLIC_MEDIA_HOST ?? "").trim()

/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
    remotePatterns: [
      ...(mediaHost
        ? [{ protocol: 'https', hostname: mediaHost, pathname: '/**' }]
        : []),
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
        pathname: '/**',
      },
    ],
    qualities: [75, 90],
  },
};

export default nextConfig;
