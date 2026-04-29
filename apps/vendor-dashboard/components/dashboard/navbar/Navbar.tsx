'use client'

import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs'
import { Button } from '@repo/ui/components/button'
import { MobileSidebar } from '@/components/dashboard/sidebar/MobileSidebar'
import NavbarNotifications from './NavbarNotifications'
import ProfileButton from './ProfileButton'
import { ThemeToggle } from '@/components/themes/theme-toggle'
import { NavbarActions } from './NavbarActions'

export function Navbar() {
  return (
    <header
      className="
        fixed top-0 left-0 right-0 z-50
        flex h-16 items-center justify-between
        border-b border-border/60
        bg-sidebar px-4 sm:px-6
      "
    >
      {/* LEFT — Mobile menu */}
      <div className="flex items-center gap-2">
        <MobileSidebar />
      </div>

      {/* CENTER — reserved */}
      <div className="hidden flex-1 lg:flex" />

      {/* RIGHT — Actions */}
      <div className="flex items-center gap-3">

        {/* Primary CTA buttons — only shown when signed in */}
        <SignedIn>
          <NavbarActions />
        </SignedIn>

        {/* Divider */}
        <div className="mx-1 h-6 w-px bg-border/60" />

        {/* Theme toggle — always visible */}
        <ThemeToggle />

        <SignedIn>
          <NavbarNotifications />
          <ProfileButton />
        </SignedIn>

        <SignedOut>
          <SignInButton mode="modal">
            <Button
              variant="outline"
              size="sm"
              className="
                h-9 rounded-xl
                transition-all duration-200
                hover:scale-[1.04] hover:shadow-md
                active:scale-[0.98]
                cursor-pointer
              "
            >
              Sign In
            </Button>
          </SignInButton>
        </SignedOut>
      </div>
    </header>
  )
}