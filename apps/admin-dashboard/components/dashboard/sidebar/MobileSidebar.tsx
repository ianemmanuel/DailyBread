"use client"

import Link from "next/link"
import { Menu } from "lucide-react"
import { Button }      from "@repo/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/sheet"
import { SidebarNav } from "./SidebarNav"
import type { AdminSessionData } from "@repo/types/admin-app"

interface MobileSidebarProps {
  session: AdminSessionData
}

/**
 * MobileSidebar — Sheet drawer, visible below lg breakpoint.
 * Triggered by the hamburger button in Navbar.
 * Closes automatically on navigation (SidebarNav renders Link components
 * which cause re-renders that collapse the Sheet).
 */
export function MobileSidebar({ session }: MobileSidebarProps) {
  const initials = session.fullName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-lg lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border">
        {/* Accessible title (visually hidden by SheetContent) */}
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>

        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary shadow-sm">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 2C6.5 2 4 5 4 8c0 2 1 3.5 2 4.5V15h8v-2.5C15 11.5 16 10 16 8c0-3-2.5-6-6-6z" fill="white" fillOpacity="0.95"/>
              <path d="M7 15h6v1.5a1 1 0 01-1 1H8a1 1 0 01-1-1V15z" fill="white" fillOpacity="0.7"/>
            </svg>
          </div>
          <Link
            href="/overview"
            className="font-display text-lg font-semibold tracking-tight text-foreground"
          >
            Daily<span className="text-primary">Bread</span>
          </Link>
          <span className="ml-auto rounded-sm bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-primary">
            Admin
          </span>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-hidden">
          <SidebarNav />
        </div>

        {/* User card */}
        <div className="shrink-0 border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/60 px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">
                {session.fullName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {session.role?.displayName ?? "—"}
              </p>
            </div>
          </div>
        </div>

      </SheetContent>
    </Sheet>
  )
}