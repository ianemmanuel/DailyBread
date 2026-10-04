'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'
import { SidebarNav } from './SidebarNav'
import { SidebarIdentity } from './SidebarIdentity'
import { BrandMark } from '@/components/dashboard/brand/BrandMark'

export function MobileSidebarSheet() {
  // Controlled, so choosing a link can close the drawer.
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {/* Burger — only visible below lg breakpoint */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="flex w-72 flex-col gap-0 border-r border-border/60 bg-sidebar p-0"
        // Any link — a nav item or the brand — closes the drawer instead of
        // leaving it covering the page that just opened.
        onClickCapture={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false) }}
      >
        {/* Visually hidden title for accessibility */}
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>

        {/* Brand header */}
        <div className="flex h-16 shrink-0 items-center border-b border-border/60 px-5">
          <BrandMark />
        </div>

        {/* Navigation — the sheet always shows the full labelled list; the
            collapsed icon rail is a desktop-only state. */}
        <div className="min-h-0 flex-1">
          <SidebarNav />
        </div>

        {/* Who is signed in */}
        <div className="shrink-0 border-t border-border/60 p-3">
          <SidebarIdentity />
        </div>
      </SheetContent>
    </Sheet>
  )
}