import { Bell } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { ThemeToggle } from "@/components/shared/theme/theme-toggle"
import { AdminProfileButton } from "./AdminProfileButton"

export function Navbar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-[transparent] bg-[var(--topbar)] px-4 shadow-[0_1px_0_0_var(--topbar-border)] backdrop-blur-xl backdrop-saturate-150 sm:px-6 lg:px-8">
      <div className="flex-1" />

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