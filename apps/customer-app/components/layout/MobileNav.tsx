"use client"

import * as React from "react"
import Link from "next/link"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Logo } from "./Logo"
import { NavLinks } from "./NavLinks"

/*
 * The navigation below `md`.
 *
 * Open state is held here rather than left uncontrolled so that choosing a
 * destination closes the sheet: a client-side route change does not unmount
 * this component, so without it the panel would stay open over the page the
 * visitor just asked for.
 *
 * Radix requires a Dialog to be labelled. The visible panel leads with the
 * wordmark rather than the word "Menu", so the title is given to assistive
 * technology only.
 */
export function MobileNav() {
  const [open, setOpen] = React.useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-lg"
          className="md:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-[min(20rem,85vw)] gap-0 p-0">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">
          Browse DailyBread and sign in to your account.
        </SheetDescription>

        <div className="flex h-16 items-center border-b border-border px-5">
          <Link href="/" onClick={() => setOpen(false)} aria-label="DailyBread home">
            <Logo className="text-xl" />
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-3" aria-label="Main">
          <NavLinks orientation="vertical" onNavigate={() => setOpen(false)} />
        </nav>

        {/* Closing the sheet before Clerk's modal opens is not cosmetic: the
            sheet is a Radix dialog and traps focus, so a modal rendered into a
            portal outside it would have unreachable inputs. */}
      </SheetContent>
    </Sheet>
  )
}
