'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus, CalendarDays } from 'lucide-react'

/*
 * The two quick actions. Real links (not router.push on a button), so they
 * prefetch, open in a new tab and announce as links. "Add meal" opens the
 * create form it names; "Add plan" still leads to Meal plans, whose creation
 * flow is not built yet.
 */
export function NavbarActions() {
  return (
    <div className="hidden items-center gap-2 md:flex">
      <Button asChild size="sm" className="h-9 rounded-xl">
        <Link href="/meals/create">
          <Plus aria-hidden className="size-4" />
          Add meal
        </Link>
      </Button>

      <Button asChild size="sm" variant="outline" className="h-9 rounded-xl">
        <Link href="/meal-plans">
          <CalendarDays aria-hidden className="size-4" />
          Add plan
        </Link>
      </Button>
    </div>
  )
}
