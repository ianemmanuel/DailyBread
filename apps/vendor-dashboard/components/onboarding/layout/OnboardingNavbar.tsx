"use client"

import Link from "next/link"
import { UserButton } from "@clerk/nextjs"
import { useEffect, useState } from "react"
import { cn } from "@repo/ui/lib/utils"

export function OnboardingNavbar() {
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full bg-background transition-shadow border-b border-border",
        isScrolled ? "shadow-lg" : "shadow-md"
      )}
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-sm tracking-tight hover:opacity-80 transition"
        >
          <div className="h-8 w-8 rounded-md bg-foreground flex items-center justify-center text-background text-xs font-bold">
            M
          </div>
          <span className="hidden sm:inline">Vendor Onboarding</span>
        </Link>

        {/* User dropdown */}
        <UserButton
          appearance={{ elements: { avatarBox: "h-8 w-8" } }}
        />
      </div>
    </header>
  )
}