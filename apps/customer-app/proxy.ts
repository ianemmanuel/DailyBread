import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

/*
 * Almost everything here is PUBLIC.
 *
 * Browsing restaurants, opening a storefront, building a basket and pricing it
 * all work signed-out — the same model Uber Eats, DoorDash and Bolt Food use,
 * and the one the backend was built for (attachCustomerContext resolves an
 * identity when there is one and continues anonymously when there is not).
 * Demanding an account to look at a menu loses the person who has not yet
 * decided to order.
 *
 * So this lists what is PROTECTED rather than what is open. A protect-by-
 * default matcher with an exemption list is the shape that eventually leaks,
 * because the exemption list is what people forget to update — but here the
 * failure mode is inverted and much safer: forgetting to add a route leaves it
 * public, and every route that touches the customer's own data or their money
 * is named below.
 *
 * The backend re-checks on every request regardless. This is UX — sending
 * someone to sign in before they fill a form — never the enforcement.
 */
const isProtectedRoute = createRouteMatcher([
  "/account(.*)",
  "/addresses(.*)",
  "/orders(.*)",
  "/checkout(.*)",
])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect()
})

export const config = {
  matcher: [
    // Everything except Next internals and static files, unless a file is
    // requested through a search param.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
