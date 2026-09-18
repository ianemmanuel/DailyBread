import Link from "next/link"
import { Facebook, Instagram, Mail, Twitter } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FOOTER_GROUPS, FOOTER_LEGAL } from "@/constants/links/footer-links"
import { Logo } from "./Logo"

/*
 * A Server Component, and nothing in it needs to be otherwise — the newsletter
 * form posts nowhere yet, so there is no state to hold and no reason to ship
 * this to the browser.
 *
 * It sits on `--surface-subtle` rather than the page ground. The band above it
 * will often be the page colour, and a footer painted the same would simply run
 * on; the one-step change is what ends the page. `--surface-subtle` is a real
 * ground in BOTH themes, so this needs no `dark:` utility of its own.
 */

const SOCIALS = [
  { href: "#", label: "DailyBread on Instagram", icon: Instagram },
  { href: "#", label: "DailyBread on Facebook", icon: Facebook },
  { href: "#", label: "DailyBread on Twitter", icon: Twitter },
] as const

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface-subtle">
      <div className="shell">
        {/* ── Top: brand + link columns ─────────────────────────────────────
            One column on a phone, two in the gap where four is too tight, and
            a 5-wide grid on desktop where the brand block takes two of them. */}
        <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-5 lg:gap-8 lg:py-16">
          <div className="space-y-4 lg:col-span-2 lg:pr-8">
            <Link href="/" aria-label="DailyBread home" className="inline-block">
              <Logo />
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Good food from great local kitchens, delivered to your door.
            </p>

            <ul className="flex items-center gap-2 pt-1">
              {SOCIALS.map(({ href, label, icon: Icon }) => (
                <li key={label}>
                  <Link
                    href={href}
                    aria-label={label}
                    className="
                      flex size-9 items-center justify-center rounded-full
                      border border-border bg-card text-muted-foreground
                      transition-colors hover:border-border-strong
                      hover:bg-primary-subtle hover:text-primary-subtle-fg
                    "
                  >
                    <Icon className="size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {FOOTER_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title} className="space-y-3">
              <h2 className="text-sm font-semibold tracking-wide text-foreground">
                {group.title}
              </h2>
              <ul className="space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-primary-text"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* ── Newsletter ───────────────────────────────────────────────────
            A real <form> with a labelled input, so it works from the keyboard
            and announces properly even though it has nowhere to post yet. */}
        <div className="border-t border-border py-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <h2 className="heading-md">Stay in the loop</h2>
              <p className="text-sm text-muted-foreground">
                Exclusive offers and new kitchens, straight to your inbox.
              </p>
            </div>

            <form
              className="flex w-full max-w-md items-center gap-2"
              /* No action yet. `noValidate` is deliberately absent so the
                 browser still enforces type="email" before anything is sent. */
            >
              <label htmlFor="footer-email" className="sr-only">
                Email address
              </label>
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="footer-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="Enter your email"
                  className="h-11 rounded-full bg-card pl-9"
                />
              </div>
              <Button type="submit" className="h-11 shrink-0 rounded-full px-5">
                Subscribe
              </Button>
            </form>
          </div>
        </div>

        {/* ── Bottom bar ───────────────────────────────────────────────── */}
        <div className="flex flex-col-reverse items-center gap-4 border-t border-border py-6 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {/* Rendered on the server at build time. A date computed in the
                browser would differ between the server and client HTML and
                trip hydration every January. */}
            © {new Date().getFullYear()} DailyBread. All rights reserved.
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {FOOTER_LEGAL.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-xs text-muted-foreground transition-colors hover:text-primary-text"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
