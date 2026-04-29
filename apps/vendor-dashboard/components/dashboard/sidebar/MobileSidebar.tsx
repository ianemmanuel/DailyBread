'use client'

import { Menu } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@repo/ui/components/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@repo/ui/components/sheet'
import { SidebarNav } from './SidebarNav'

export function MobileSidebar() {
  return (
    <Sheet>
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
        <div className="flex-1 overflow-hidden">
          <SidebarNav />
        </div>

        {/* Vendor profile */}
        <div className="shrink-0 border-t border-border/60 p-3">
          <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/70 px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              WK
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">Wanjiku's Kitchen</p>
              <p className="truncate text-xs text-muted-foreground">wanjiku@example.com</p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}