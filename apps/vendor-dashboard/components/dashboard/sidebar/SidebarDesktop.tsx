'use client'

import { SidebarNav } from './SidebarNav'
import Link from 'next/link'

export function SidebarDesktop() {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-border/70 bg-white lg:flex">

      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border/70 px-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary shadow-sm">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 2C6.5 2 4 5 4 8c0 2 1 3.5 2 4.5V15h8v-2.5C15 11.5 16 10 16 8c0-3-2.5-6-6-6z" fill="white" fillOpacity="0.95"/>
            <path d="M7 15h6v1.5a1 1 0 01-1 1H8a1 1 0 01-1-1V15z" fill="white" fillOpacity="0.7"/>
          </svg>
        </div>
        <Link href="/dashboard" className="font-display text-lg font-700 tracking-tight text-foreground">
          Daily<span className="text-primary">Bread</span>
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-hidden">
        <SidebarNav />
      </div>

      {/* Vendor card */}
      <div className="shrink-0 border-t border-border/70 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-secondary/50 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            WK
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">Wanjiku's Kitchen</p>
            <p className="truncate text-xs text-muted-foreground">wanjiku@example.com</p>
          </div>
        </div>
      </div>

    </aside>
  )
}