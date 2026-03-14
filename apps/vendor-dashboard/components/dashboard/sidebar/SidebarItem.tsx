'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@repo/ui/lib/utils'
import { NavItem } from '@/utils/constants/nav-links'
import { SidebarDropdown } from './SidebarDropdown'

interface SidebarItemProps {
  item: NavItem
}

export function SidebarItem({ item }: SidebarItemProps) {
  const pathname = usePathname()
  const Icon = item.icon

  if (item.type === 'dropdown') {
    return <SidebarDropdown item={item} />
  }

  const isActive = pathname === item.href

  return (
    <Link
      href={item.href!}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150',
        isActive
          ? 'bg-primary/8 text-primary'
          : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
      )}
    >
      <Icon className={cn(
        'h-4 w-4 shrink-0',
        isActive ? 'text-primary' : 'text-muted-foreground/70'
      )} />
      <span className="flex-1">{item.label}</span>
      {isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
    </Link>
  )
}