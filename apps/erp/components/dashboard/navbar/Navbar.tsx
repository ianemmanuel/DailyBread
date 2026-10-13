import { AdminProfileButton } from "./AdminProfileButton"
import { NotificationBell } from "./NotificationBell"

export function Navbar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-[transparent] bg-[var(--topbar)] px-4 shadow-[0_1px_0_0_var(--topbar-border)] backdrop-blur-xl backdrop-saturate-150 sm:px-6 lg:px-8">
      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <NotificationBell />

        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

        <AdminProfileButton />
      </div>
    </header>
  )
}