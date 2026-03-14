'use client'

import { menuItems } from '@/utils/constants/nav-links'
import { SidebarItem } from './SidebarItem'

export function SidebarNav() {
  return (
    <nav className="h-full overflow-y-auto px-3 py-4">
      <ul className="space-y-0.5">
        {menuItems.map((item) => (
          <li key={item.label}>
            <SidebarItem item={item} />
          </li>
        ))}
      </ul>
    </nav>
  )
}