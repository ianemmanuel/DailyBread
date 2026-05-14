import { Bell } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { ThemeToggle } from "@/components/shared/theme/theme-toggle"
import { AdminProfileButton } from "./AdminProfileButton"
import { MobileSidebar } from "@/components/dashboard/sidebar/MobileSidebar"

interface NavbarProps {
  session: any
}

/**
 * Navbar — sticky top bar.
 *
 * MobileSidebar renders its own SheetTrigger (burger) + SheetContent.
 * They MUST live in the same component so Radix Sheet context is intact.
 * The trigger is lg:hidden so it only appears on mobile.
 */
export function Navbar({ session }: NavbarProps) {
  return (
    <header
      className="sticky top-0 z-30 flex h-16 items-center border-b border-topbar-border px-4 sm:px-6 lg:px-8"
      style={{
        backgroundColor: "color-mix(in oklch, var(--topbar) 92%, transparent)",
        backdropFilter: "blur(10px) saturate(1.4)",
        WebkitBackdropFilter: "blur(10px) saturate(1.4)",
        boxShadow: "0 1px 0 0 var(--border), 0 2px 8px -2px oklch(0 0 0 / 4%)",
      }}
    >
      {/* Mobile burger + Sheet — self-contained, lg:hidden trigger inside */}
      <MobileSidebar session={session} />

      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-1">
        <ThemeToggle />

        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-lg"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span
            className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary"
            aria-hidden="true"
          />
        </Button>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

        <AdminProfileButton />
      </div>
    </header>
  )
}