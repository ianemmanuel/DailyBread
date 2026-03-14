'use client'

import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'

/*
  ONBOARDING NAVBAR
  Intentionally simpler than the dashboard navbar:
  - No sidebar burger (onboarding has no sidebar)
  - No notifications (not relevant during onboarding)
  - Same brand mark and colors as the rest of the app
*/
export function OnboardingNavbar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border/70 bg-white/95 px-4 backdrop-blur-md sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between">

        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M10 2C6.5 2 4 5 4 8c0 2 1 3.5 2 4.5V15h8v-2.5C15 11.5 16 10 16 8c0-3-2.5-6-6-6z"
                fill="white" fillOpacity="0.95"
              />
              <path
                d="M7 15h6v1.5a1 1 0 01-1 1H8a1 1 0 01-1-1V15z"
                fill="white" fillOpacity="0.7"
              />
            </svg>
          </div>
          <span className="font-display text-base font-semibold tracking-tight text-foreground">
            Daily<span className="text-primary">Bread</span>
          </span>
        </Link>

        <UserButton appearance={{ elements: { avatarBox: 'h-8 w-8' } }} />
      </div>
    </header>
  )
}