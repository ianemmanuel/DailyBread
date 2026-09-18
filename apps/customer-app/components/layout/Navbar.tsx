"use client"

import Link from "next/link"
import {
  ClerkLoading,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs"

import { ThemeToggle } from "@/components/themes/ThemeToggle"
import { Button } from "@/components/ui/button"
import { Logo } from "./Logo"
import { MobileNav } from "./MobileNav"
import { NavLinks } from "./NavLinks"

/*
 * A Client Component, like the vendor dashboard's Navbar, and for a concrete
 * reason: Clerk's <Show> has two versions. Rendered from a Server Component it
 * calls `await auth()`, which reads the request headers and turns EVERY page
 * using this navbar dynamic. Rendered from a Client Component it reads the
 * session in the browser, and pages stay static. "use client" here is what
 * lets Clerk's components sit in the navbar directly, with no wrapper.
 *
 * Clerk has no built-in skeleton. <ClerkLoading> is its slot for your own
 * placeholder, which stops the bar changing width when the buttons appear.
 */
export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <nav aria-label="Main" className="shell flex h-nav items-center gap-4">
        <Link
          href="/"
          aria-label="DailyBread home"
          className="shrink-0 rounded-sm transition-opacity hover:opacity-80"
        >
          <Logo />
        </Link>

        <div className="hidden flex-1 justify-center md:flex">
          <NavLinks />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          <ThemeToggle className="max-md:hidden" />

          <ClerkLoading>
            <div className="h-10 w-24 rounded-full shimmer sm:w-52" />
          </ClerkLoading>

          <Show when="signed-out">
            <SignInButton>
              <Button variant="brand" className="h-10 rounded-full px-4 max-sm:hidden">
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton>
              <Button className="h-10 rounded-full px-5">Get Started</Button>
            </SignUpButton>
          </Show>

          <Show when="signed-in">
            <UserButton />
          </Show>

          <MobileNav />
        </div>
      </nav>
    </header>
  )
}
