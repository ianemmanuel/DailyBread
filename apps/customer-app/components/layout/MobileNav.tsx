"use client"

import * as React from "react"
import Link from "next/link"
import { Menu, Monitor, Moon, Sun, X } from "lucide-react"
import {
  ClerkLoading,
  Show,
  SignInButton,
  SignOutButton,
  SignUpButton,
  UserAvatar,
} from "@clerk/nextjs"

import { useTheme, type Theme } from "@/components/themes/theme-provider"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Logo } from "./Logo"
import { NavLinks } from "./NavLinks"

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

/*
 * The navigation below `md`, built on shadcn's Sheet.
 *
 * Open state is controlled so that choosing a link closes the sheet: navigation
 * happens in the browser, which does not unmount this component.
 *
 * Signed in, the sheet shows an avatar and a sign-out button instead of Clerk's
 * <UserButton>. UserButton opens its menu in a portal outside the sheet, and the
 * sheet is a dialog that blocks clicks outside itself, so that menu could not be
 * used from here. The desktop bar keeps UserButton.
 */
export function MobileNav() {
  const [open, setOpen] = React.useState(false)
  const close = () => setOpen(false)
  const { theme, setTheme } = useTheme()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="md:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[min(22rem,88vw)] gap-0 border-border bg-background p-0"
      >
        <SheetHeader className="h-nav shrink-0 flex-row items-center justify-between border-b border-border px-4 py-0">
          <SheetTitle asChild>
            <Link href="/" onClick={close} aria-label="DailyBread home">
              <Logo className="text-xl lg:text-xl" />
            </Link>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Browse DailyBread and manage your account.
          </SheetDescription>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close menu">
              <X className="size-5" />
            </Button>
          </SheetClose>
        </SheetHeader>

        <div className="flex-1 space-y-7 overflow-y-auto px-3 py-5">
          <nav aria-label="Main" className="space-y-2">
            <p className="px-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Menu
            </p>
            <NavLinks orientation="vertical" onNavigate={close} />
          </nav>

          <div className="space-y-2 px-3">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Appearance
            </p>
            <div
              role="radiogroup"
              aria-label="Theme"
              className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted p-1"
            >
              {THEMES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={theme === value}
                  onClick={() => setTheme(value)}
                  className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-checked:bg-card aria-checked:text-foreground aria-checked:shadow-xs"
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* The click handler is on this wrapper, not on the buttons: Clerk copies
            its child button to add its own click handler, so one set on the
            child may be dropped. A click on either button still bubbles here. */}
        <SheetFooter className="shrink-0 border-t border-border bg-card p-4" onClick={close}>
          <ClerkLoading>
            <div className="h-11 w-full rounded-full shimmer" />
            <div className="h-11 w-full rounded-full shimmer" />
          </ClerkLoading>

          <Show when="signed-out">
            <SignUpButton>
              <Button className="h-11 w-full rounded-full">Get Started</Button>
            </SignUpButton>
            <SignInButton>
              <Button variant="brand" className="h-11 w-full rounded-full">
                Sign in
              </Button>
            </SignInButton>
          </Show>

          <Show when="signed-in">
            <div className="flex items-center gap-3">
              <UserAvatar />
              <span className="flex-1 text-sm font-medium">Your account</span>
              <SignOutButton>
                <Button variant="ghost" size="sm">
                  Sign out
                </Button>
              </SignOutButton>
            </div>
          </Show>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
