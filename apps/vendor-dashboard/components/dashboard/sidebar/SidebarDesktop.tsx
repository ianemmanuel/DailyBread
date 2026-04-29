'use client'

import { SidebarNav } from './SidebarNav'
import Link from 'next/link'

export function SidebarDesktop() {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-border/60 bg-sidebar lg:flex">

      {/* Ambient glow behind logo area */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 glow-left opacity-60" />

      {/* Logo */}
      <div className="relative flex h-16 shrink-0 items-center gap-3 border-b border-border/60 px-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary shadow-[0_2px_10px_var(--shadow-primary)]">
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 2C6.5 2 4 5 4 8c0 2 1 3.5 2 4.5V15h8v-2.5C15 11.5 16 10 16 8c0-3-2.5-6-6-6z" fill="currentColor" className="text-primary-foreground" fillOpacity="0.95"/>
            <path d="M7 15h6v1.5a1 1 0 01-1 1H8a1 1 0 01-1-1V15z" fill="currentColor" className="text-primary-foreground" fillOpacity="0.65"/>
          </svg>
        </div>
        <Link href="/dashboard" className="font-display text-lg font-bold tracking-tight text-foreground">
          Daily<span className="text-primary">Bread</span>
        </Link>
      </div>

      {/* Navigation */}
      <div className="relative flex-1 overflow-hidden">
        <SidebarNav />
      </div>

      {/* Vendor profile card */}
      <div className="relative shrink-0 border-t border-border/60 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/70 px-3 py-2.5 transition-colors duration-200 hover:bg-sidebar-accent">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow-[0_2px_8px_var(--shadow-primary)]">
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