import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Logo } from "./Logo"
import { NavLinks } from "./NavLinks"
import { MobileNav } from "./MobileNav"
import { SignInButton, SignUpButton, UserButton, Show } from "@clerk/nextjs"


export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-surface-cream/85 backdrop-blur-md">
      <nav
        aria-label="Main"
        className="shell flex h-nav items-center justify-between gap-4"
      >
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

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Show when="signed-out">
              <SignInButton />
              <SignUpButton>
                <Button className="bg-primary text-primary-foreground rounded-full font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 cursor-pointer">
                  Get Started
                </Button>
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
