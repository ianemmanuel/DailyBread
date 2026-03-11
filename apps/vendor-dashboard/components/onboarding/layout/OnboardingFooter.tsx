"use client"

import Link from "next/link"

export function OnboardingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-4 justify-center sm:justify-start">
            <Link href="/help" className="hover:text-foreground transition-colors">Help</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
          </div>
          <div className="text-center sm:text-right">
            © {new Date().getFullYear()} Meal Platform. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  )
}