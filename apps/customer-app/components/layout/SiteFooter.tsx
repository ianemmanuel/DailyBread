import Link from "next/link"
import { Wordmark } from "./Wordmark"

/*
 * Deliberately quiet. A marketplace footer competing with the food above it is
 * a footer that makes the page feel like a brochure — so this is one espresso
 * band with the essentials and nothing that asks to be read.
 */
export function SiteFooter() {
  return (
    <footer className="mt-16 bg-[var(--deep)] text-[var(--deep-foreground)]">
      <div className="shell flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <span className="[&_span]:text-[var(--deep-foreground)]">
            <Wordmark />
          </span>
          <p className="max-w-sm text-sm leading-relaxed text-[var(--deep-foreground)]/65">
            Order from the kitchens near you, and eat well today.
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--deep-foreground)]/75">
          <Link href="/" className="cursor-pointer transition-colors hover:text-[var(--deep-foreground)]">
            Restaurants
          </Link>
          <Link href="/account" className="cursor-pointer transition-colors hover:text-[var(--deep-foreground)]">
            Your account
          </Link>
          <a
            href="/sign-in"
            className="cursor-pointer transition-colors hover:text-[var(--deep-foreground)]"
          >
            Sign in
          </a>
        </nav>
      </div>

      <div className="border-t border-white/10">
        <div className="shell py-4 text-xs text-[var(--deep-foreground)]/50">
          &copy; {new Date().getFullYear()} DailyBread
        </div>
      </div>
    </footer>
  )
}
