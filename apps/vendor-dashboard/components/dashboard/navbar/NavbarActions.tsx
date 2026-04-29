'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/button'
import { Plus, CalendarDays } from 'lucide-react'

export function NavbarActions() {
  const router = useRouter()

  return (
    <div className="hidden items-center gap-2 md:flex">
      <Button
        size="sm"
        onClick={() => router.push('/meals')}
        className="
          h-9 rounded-xl bg-primary text-primary-foreground
          transition-all duration-200
          hover:scale-[1.04] hover:opacity-90 hover:shadow-md
          active:scale-[0.98]
          cursor-pointer
        "
      >
        <Plus className="mr-1 h-4 w-4" />
        Add Meal
      </Button>

      <Button
        size="sm"
        variant="outline"
        onClick={() => router.push('/meal-plans')}
        className="
          h-9 rounded-xl
          transition-all duration-200
          hover:scale-[1.04] hover:shadow-md
          active:scale-[0.98]
          cursor-pointer
        "
      >
        <CalendarDays className="mr-1 h-4 w-4" />
        Add Plan
      </Button>
    </div>
  )
}