import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

/*
 * Next 16's Proxy (the file convention formerly called `middleware`).
 *
 * ── It lists what is PROTECTED, never what is public ───────────────────────
 *
 * The inverse — exempting public routes — fails in the dangerous direction: a
 * route someone forgets to exempt starts demanding a sign-in for browsing,
 * and worse, the habit invites "protect everything, exempt as needed", which
 * is how an anonymous-first storefront quietly stops being one. Here a
 * forgotten route stays PUBLIC, which is this app's default and the thing
 * customers came for.
 *
 * ── What belongs on this list ──────────────────────────────────────────────
 *
 * Only what is durable and personal. Browsing, markets, storefronts, setting
 * a delivery point and pricing a cart are all public by design — the gate goes
 * where the commitment is, not in front of the food. `/account` is the first
 * route that fails that test: it is somebody's own record.
 *
 * `auth.protect()` redirects to the sign-in page with a `redirect_url` for the
 * page they wanted, so Clerk returns them there afterwards. It also keeps the
 * gate OUT of the pages themselves, which is why the rest of the app can stay
 * statically rendered.
 */
const isProtectedRoute = createRouteMatcher([
  '/account(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect()
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Always run for Clerk-specific frontend API routes
    '/__clerk/(.*)',
  ],
}
