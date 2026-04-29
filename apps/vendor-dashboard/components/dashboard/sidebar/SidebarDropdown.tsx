'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@repo/ui/lib/utils'
import { NavItem } from '@/utils/constants/nav-links'

interface SidebarDropdownProps {
  item: NavItem
}

export function SidebarDropdown({ item }: SidebarDropdownProps) {
  const pathname = usePathname()
  const Icon = item.icon
  const isActive = item.items?.some((sub) => pathname === sub.href) ?? false
  const [isOpen, setIsOpen] = useState(isActive)

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'sidebar-item w-full',
          isActive && 'sidebar-item-active'
        )}
      >
        <Icon className={cn(
          'h-4 w-4 shrink-0 transition-colors duration-200',
          isActive ? 'text-primary' : 'text-muted-foreground/60'
        )} />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown className={cn(
          'h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200',
          isOpen && 'rotate-180'
        )} />
      </button>

      <div className={cn(
        'overflow-hidden transition-all duration-250',
        isOpen ? 'max-h-56 opacity-100' : 'max-h-0 opacity-0'
      )}>
        <ul className="ml-4 mt-1 space-y-0.5 border-l border-border/50 pl-3">
          {item.items?.map((sub) => {
            const isSubActive = pathname === sub.href
            return (
              <li key={sub.href}>
                <Link
                  href={sub.href}
                  className={cn(
                    'block rounded-lg px-3 py-2 text-sm transition-colors duration-150',
                    isSubActive
                      ? 'font-semibold text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {sub.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}