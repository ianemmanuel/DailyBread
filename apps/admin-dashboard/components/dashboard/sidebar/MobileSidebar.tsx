"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu, LogOut } from "lucide-react"
import { useClerk } from "@clerk/nextjs"
import { Button } from "@repo/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/sheet"
import { SidebarNav } from "./SidebarNav"
import type { AdminSessionData } from "@repo/types/admin-app"

interface Props {
  session: AdminSessionData
}

/**
 * MobileSidebar — Sheet drawer for screens below lg breakpoint.
 *
 * Architecture: SheetTrigger + SheetContent MUST live in the same
 * component so they share Radix Sheet context. This whole component
 * is rendered inside Navbar — trigger is lg:hidden so only mobile sees it.
 *
 * Features:
 * - Burger trigger (lg:hidden) in Navbar position
 * - Shadcn Sheet slides from left, X button built-in
 * - Collapsible nav groups (isMobile=true → always expanded, no popovers)
 * - Scrollable nav area
 * - User card + Logout button pinned to footer
 * - Closes on outside tap (Sheet default behaviour)
 */
export function MobileSidebar({ session }: Props) {
  const [open, setOpen] = useState(false)
  const { signOut } = useClerk()

  const first = session.firstName?.trim() ?? ""
  const last  = session.lastName?.trim()  ?? ""
  const initials = (
    (first[0] ?? "") + (last[0] ?? "") || first[0] || "?"
  ).toUpperCase()
  const displayName = [session.firstName, session.lastName]
    .filter(Boolean)
    .join(" ")

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* Burger button — only visible below lg breakpoint */}
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

      <SheetContent
        side="left"
        className="flex w-[280px] flex-col p-0 sm:w-[300px]"
        style={{
          backgroundColor: "var(--sidebar)",
          borderRight: "1px solid var(--sidebar-border)",
          // Force the sheet to be visible with explicit z-index
          zIndex: 100,
        }}
      >
        {/* Accessible title (visually hidden) */}
        <SheetTitle className="sr-only">Navigation</SheetTitle>

        {/* ── Header: logo + Admin badge ──────────────────── */}
        <div
          className="flex h-16 shrink-0 items-center gap-3 px-5"
          style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        >
          {/* Logo mark */}
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: "var(--primary)" }}
          >
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

          {/* Wordmark */}
          <Link
            href="/overview"
            className="font-display text-[15px] font-semibold tracking-tight"
            style={{ color: "var(--foreground)" }}
            onClick={() => setOpen(false)}
          >
            Daily<span style={{ color: "var(--primary)" }}>Bread</span>
          </Link>

          {/* Admin badge */}
          <span
            className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest"
            style={{
              backgroundColor: "var(--primary-subtle)",
              color: "var(--primary)",
            }}
          >
            Admin
          </span>
        </div>

        {/* ── Nav — scrollable, full height ───────────────── */}
        {/*
         * min-h-0 is critical here: without it, a flex child won't
         * shrink below its content size, so overflow-y-auto never kicks in.
         * flex-1 + min-h-0 together = "take remaining space and scroll".
         */}
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <SidebarNav collapsed={false} isMobile />
        </div>

        {/* ── Footer: user card + logout ───────────────────── */}
        <div
          className="shrink-0 p-3 space-y-2"
          style={{ borderTop: "1px solid var(--sidebar-border)" }}
        >
          {/* User card */}
          <div
            className="flex items-center gap-3 rounded-lg px-3 py-2.5"
            style={{ backgroundColor: "var(--sidebar-hover-bg)" }}
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
              style={{
                backgroundColor: "var(--primary-subtle)",
                color: "var(--primary)",
              }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-semibold leading-tight"
                style={{ color: "var(--foreground)" }}
              >
                {displayName || "—"}
              </p>
              <p
                className="truncate text-xs leading-tight"
                style={{ color: "var(--muted-foreground)" }}
              >
                {session.role?.displayName ?? "Admin"}
              </p>
            </div>
          </div>

          {/* Logout button */}
          <button
            onClick={() => signOut({ redirectUrl: "/sign-in" })}
            className={[
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5",
              "text-sm font-medium transition-colors duration-150",
              "text-[var(--muted-foreground)] hover:bg-[var(--sidebar-hover-bg)] hover:text-destructive",
            ].join(" ")}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}