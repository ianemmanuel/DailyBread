"use client"

import Link from "next/link"
import { Menu, LogOut } from "lucide-react"
import { useClerk } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { SidebarNav } from "./SidebarNav"
import type { AdminSessionData } from "@repo/types/admin-app"

interface Props {
  session: AdminSessionData
}

export function MobileSidebar({ session }: Props) {
  const { signOut } = useClerk()

  const first       = session.firstName?.trim() ?? ""
  const last        = session.lastName?.trim()  ?? ""
  const initials    = ((first[0] ?? "") + (last[0] ?? "") || first[0] || "?").toUpperCase()
  const displayName = [session.firstName, session.lastName].filter(Boolean).join(" ")

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="fixed left-4 top-3.5 z-40 h-9 w-9 rounded-lg lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="flex w-[280px] flex-col gap-0 border-r border-sidebar-border bg-sidebar p-0 sm:w-[300px]"
      >
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <SheetDescription className="sr-only">
          Main navigation for the DailyBread admin dashboard
        </SheetDescription>

        {/* ── Header ──────────────────────────────────────── */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 2C6.5 2 4 5 4 8c0 2 1 3.5 2 4.5V15h8v-2.5C15 11.5 16 10 16 8c0-3-2.5-6-6-6z" fill="white" fillOpacity="0.95" />
              <path d="M7 15h6v1.5a1 1 0 01-1 1H8a1 1 0 01-1-1V15z" fill="white" fillOpacity="0.7" />
            </svg>
          </div>

          <Link
            href="/overview"
            className="font-display text-[15px] font-semibold tracking-tight text-foreground"
          >
            Daily<span className="text-primary">Bread</span>
          </Link>

          <span className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-primary/10 text-primary">
            Admin
          </span>
        </div>

        {/* ── Nav — scrollable ─────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav collapsed={false} isMobile />
        </div>

        {/* ── Footer ──────────────────────────────────────── */}
        <div className="shrink-0 space-y-1 border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg bg-sidebar-active-bg px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight text-foreground">
                {displayName || "—"}
              </p>
              <p className="truncate text-xs leading-tight text-muted-foreground">
                {session.role?.displayName ?? "Admin"}
              </p>
            </div>
          </div>

          <button
            onClick={() => signOut({ redirectUrl: "/sign-in" })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-sidebar-hover-bg hover:text-destructive"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}