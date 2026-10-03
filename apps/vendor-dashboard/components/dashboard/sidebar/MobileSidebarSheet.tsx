'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'
import { SidebarNav } from './SidebarNav'
import { SidebarIdentity } from './SidebarIdentity'

export function MobileSidebarSheet() {
  // Controlled, so choosing a link closes the drawer instead of leaving it
  // covering the page that just opened.
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
      >
        {/* Visually hidden title for accessibility */}
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>

        {/* Logo header */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border/60 px-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary shadow-[0_2px_10px_var(--shadow-primary)]">
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 2C6.5 2 4 5 4 8c0 2 1 3.5 2 4.5V15h8v-2.5C15 11.5 16 10 16 8c0-3-2.5-6-6-6z" fill="white" fillOpacity="0.95"/>
              <path d="M7 15h6v1.5a1 1 0 01-1 1H8a1 1 0 01-1-1V15z" fill="white" fillOpacity="0.65"/>
            </svg>
          </div>
          <Link href="/dashboard" className="font-display text-lg font-bold tracking-tight text-foreground">
            Daily<span className="text-primary">Bread</span>
          </Link>
        </div>

        {/* Navigation */}
        <div
          className="flex-1 overflow-hidden"
          onClickCapture={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false) }}
        >
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