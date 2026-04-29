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
        'sidebar-item',
        isActive && 'sidebar-item-active'
      )}
    >
      <Icon className={cn(
        'h-4 w-4 shrink-0 transition-colors duration-200',
        isActive ? 'text-primary' : 'text-muted-foreground/60'
      )} />
      <span className="flex-1">{item.label}</span>
      {/* Active indicator dot */}
      {isActive && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
      )}
    </Link>
  )
}