'use client'

import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { MobileSidebar } from '@/components/dashboard/sidebar/MobileSidebar'
import { BrandMark } from '@/components/dashboard/brand/BrandMark'
import ProfileButton from './ProfileButton'
import { NavbarActions } from './NavbarActions'
import { NotificationsLink } from './NotificationsLink'
import { SidebarToggle } from './SidebarToggle'

/*
 * The top bar. It lives INSIDE the content column (sticky), never across the
 * whole viewport: a full-width fixed bar sat on top of the desktop sidebar's
 * brand header and needed a magic padding on <main> to clear it.
 *
 *   phone   [☰][brand]                               [🔔][avatar]
 *   desktop [⇤ collapse]                     [+ meal][plan] | [🔔][avatar]
 *
 * The brand shows here only below `lg`, where there is no sidebar to carry
 * it; BrandMark is the one place the future logo goes.
 */
export function Navbar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-sidebar/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-sidebar/80 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileSidebar />
        <BrandMark className="lg:hidden" />
        <SidebarToggle className="hidden lg:inline-flex" />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <SignedIn>
          <NavbarActions />
          <div aria-hidden className="mx-1 hidden h-6 w-px bg-border/60 md:block" />
          <NotificationsLink />
          <ProfileButton />
        </SignedIn>

        <SignedOut>
          <SignInButton mode="modal">
            <Button variant="outline" size="sm" className="h-9 cursor-pointer rounded-xl">
              Sign in
            </Button>
          </SignInButton>
        </SignedOut>
      </div>
    </header>
  )
}
