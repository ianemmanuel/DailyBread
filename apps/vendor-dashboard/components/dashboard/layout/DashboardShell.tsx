/*
  DASHBOARD LAYOUT PRIMITIVES
  ─────────────────────────────────────────────────────────────────
  Import these in any dashboard page to get correct responsive
  behaviour without repeating yourself.

  PageGrid    — the standard vertical stack for a page
  SectionGrid — responsive column grid (default: 3-col on lg)
  TableShell  — horizontal scroll wrapper for tables
  ChartShell  — min-w-0 guard for recharts (prevents overflow)

  Usage example:
  ─────────────────────────────────────────────────────────────────
  <PageGrid>
    <PageHeader title="Orders" />
    <StatsCards />
    <SectionGrid cols={3}>
      <div className="lg:col-span-2"><RevenueChart /></div>
      <div><MealPlanPerformance /></div>
    </SectionGrid>
    <TableShell><RecentOrders /></TableShell>
  </PageGrid>
  ─────────────────────────────────────────────────────────────────
*/

import { cn } from '@repo/ui/lib/utils'

// ── PageGrid ──────────────────────────────────────────────────────
// Vertical stack for an entire page. Consistent gap between sections.
export function PageGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-6 sm:gap-8', className)}>
      {children}
    </div>
  )
}

// ── SectionGrid ───────────────────────────────────────────────────
// Responsive multi-column grid. Stacks to 1 col on mobile.
// cols prop sets the lg: column count (2 or 3, default 3).
export function SectionGrid({
  children,
  cols = 3,
  className,
}: {
  children: React.ReactNode
  cols?: 2 | 3 | 4
  className?: string
}) {
  const colClass = {
    2: 'lg:grid-cols-2',
    3: 'lg:grid-cols-3',
    4: 'lg:grid-cols-4',
  }[cols]

  return (
    <div className={cn('grid grid-cols-1 gap-6', colClass, className)}>
      {children}
    </div>
  )
}

// ── TableShell ────────────────────────────────────────────────────
// Wraps any Card that contains a table.
// overflow-x-auto enables horizontal scroll on small screens instead
// of breaking layout. min-w-0 prevents parent flex blowout.
export function TableShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0 overflow-x-auto', className)}>
      {children}
    </div>
  )
}

// ── ChartShell ────────────────────────────────────────────────────
// Recharts doesn't respect flex min-width by default and will overflow
// its container. min-w-0 on the wrapper fixes this.
export function ChartShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {children}
    </div>
  )
}