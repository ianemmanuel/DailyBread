'use client'

import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs'
import { Button } from '@repo/ui/components/button'
import { MobileSidebar } from '@/components/dashboard/sidebar/MobileSidebar'
import NavbarNotifications from './NavbarNotifications'
import ProfileButton from './ProfileButton'

// MobileSidebar renders its own burger button (lg:hidden).
// On mobile: burger is visible here in the topbar → opens Sheet.
// On desktop: burger hidden, desktop sidebar is always visible.
export function Navbar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border/70 bg-white/95 px-4 backdrop-blur-md sm:px-6">

      <MobileSidebar />

      <div className="flex flex-1 items-center justify-end gap-2">
        <SignedIn>
          <NavbarNotifications />
          <ProfileButton />
        </SignedIn>
        <SignedOut>
          <SignInButton mode="modal">
            <Button variant="outline" size="sm" className="h-9">Sign In</Button>
          </SignInButton>
        </SignedOut>
      </div>

    </header>
  )
}