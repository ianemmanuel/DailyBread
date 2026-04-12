import { Bell }               from "lucide-react"
import { Button }             from "@repo/ui/components/button"
import { MobileSidebar }      from "@/components/dashboard/sidebar/MobileSidebar"
import { ThemeToggle }        from "./ThemeToggle"
import { AdminProfileButton } from "./AdminProfileButton"
import type { AdminSessionData } from "@repo/types/admin-app"

interface Props { session: AdminSessionData }

/**
 * Navbar — sticky top bar for ALL dashboard pages.
 *
 * Uses CSS custom properties for colours so light and dark themes
 * work automatically — no explicit dark: variants needed here.
 *
 * Server component shell. Only MobileSidebar, ThemeToggle, and
 * AdminProfileButton are client components (all small and isolated).
 */
export function Navbar({ session }: Props) {
  return (
    <header
      className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 px-4 backdrop-blur-md sm:px-6"
      style={{
        backgroundColor: "color-mix(in oklch, var(--background) 92%, transparent)",
        borderBottom   : "1px solid color-mix(in oklch, var(--border) 70%, transparent)",
      }}
    >
      {/* Mobile hamburger */}
      <MobileSidebar session={session} />

      <div className="flex-1" />

      <div className="flex items-center gap-1">

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Notifications placeholder */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-lg text-(--muted-foreground) hover:bg-(--secondary) hover:text-(--foreground)"
          aria-label="Notifications"
        >
          <Bell className="h-[1.1rem] w-[1.1rem]" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary opacity-80" aria-hidden="true" />
        </Button>

        <span
          className="mx-1 hidden h-5 w-px sm:block"
          style={{ backgroundColor: "var(--border)" }}
          aria-hidden="true"
        />

        <AdminProfileButton />
      </div>
    </header>
  )
}