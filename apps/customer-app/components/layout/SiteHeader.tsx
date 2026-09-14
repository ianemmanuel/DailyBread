import Link from "next/link"
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs"
import { Button } from "@repo/ui/components/button"
import { LocationButton } from "@/components/location/LocationButton"
import { CartButton } from "@/components/cart/CartButton"
import { Wordmark } from "@/components/layout/Wordmark"
import type { StoredLocation } from "@/lib/location/cookie"

/*
 * The header, and the only piece of chrome on every page.
 *
 * A Server Component. The location and the signed-in state are both resolved on
 * the server and passed down, so the first paint is already correct — no flash
 * of "Set your location" for someone who has one, and no flash of a signed-out
 * header for someone who is not. Only the three pieces that genuinely need the
 * browser are client components, and each is as small as it can be.
 *
 * Sticky, because the basket and the delivery address are the two things a
 * customer reaches for mid-scroll on a long menu.
 */
export function SiteHeader({
  location, signedIn,
}: {
  location: StoredLocation | null
  signedIn: boolean
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--card)]/85 backdrop-blur-lg">
      <div className="shell flex h-16 items-center gap-3">
        <Link href="/" className="shrink-0" aria-label="DailyBread home">
          <Wordmark />
        </Link>

        {/* The address sits next to the logo rather than in a menu, because it
            is the single input that decides everything else on the page. */}
        <div className="min-w-0 flex-1">
          <LocationButton location={location} signedIn={signedIn} />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <CartButton />

          <SignedOut>
            {/* "Sign in", not "Sign up": nothing here is gated, so the only
                people who need this are returning customers. */}
            <Button asChild size="sm" variant="ghost" className="hidden cursor-pointer sm:inline-flex">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </SignedOut>

          <SignedIn>
            <UserButton
              appearance={{ elements: { avatarBox: "size-8" } }}
              userProfileMode="navigation"
              userProfileUrl="/account"
            />
          </SignedIn>
        </div>
      </div>
    </header>
  )
}
