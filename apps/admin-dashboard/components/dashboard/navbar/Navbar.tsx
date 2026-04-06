import { Bell }                from "lucide-react"
import { Button }              from "@repo/ui/components/button"
import { MobileSidebar }       from "@/components/dashboard/sidebar/MobileSidebar"
import { ThemeToggle }         from "./ThemeToggle"
import { AdminProfileButton }  from "./AdminProfileButton"
import type { AdminSessionData } from "@repo/types/admin-app"

interface NavbarProps {
  session: AdminSessionData
}

/**
 * Navbar — sticky top bar for all dashboard routes.
 *
 * Left:  mobile hamburger (hidden lg+) — opens MobileSidebar Sheet
 * Right: theme toggle, notifications, profile button
 *
 * Server component shell — only MobileSidebar, ThemeToggle, and
 * AdminProfileButton are client components (all are small and isolated).
 * No useEffect at this level.
 */
export function Navbar({ session }: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border/70 bg-background/95 px-4 backdrop-blur-md sm:px-6">

      {/* Mobile hamburger → opens Sheet sidebar */}
      <MobileSidebar session={session} />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-1">

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Notifications — placeholder for now, matches vendor pattern */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground dark:hover:bg-white/5"
          aria-label="Notifications"
        >
          <Bell className="h-4.5 w-4.5" />
          {/* Unread dot — replace with real count once notification module is built */}
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary opacity-80" aria-hidden="true" />
        </Button>

        {/* Divider */}
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />

        {/* Profile + role/scope pill + Clerk dropdown */}
        <AdminProfileButton />

      </div>
    </header>
  )
}