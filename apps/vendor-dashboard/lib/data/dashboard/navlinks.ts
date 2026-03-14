import {
  LayoutDashboard,
  ShoppingBag,
  Utensils,
  CalendarDays,
  Truck,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface NavSubItem {
  label: string
  href: string
}

export interface NavItem {
  label: string
  icon: LucideIcon
  type: 'link' | 'dropdown'
  href?: string
  items?: NavSubItem[]
}

export const menuItems: NavItem[] = [
  {
    label: 'Overview',
    icon: LayoutDashboard,
    type: 'link',
    href: '/dashboard',
  },
  {
    label: 'Orders',
    icon: ShoppingBag,
    type: 'link',
    href: '/dashboard/orders',
  },
  {
    label: 'Menu',
    icon: Utensils,
    type: 'dropdown',
    items: [
      { label: 'All Meals',   href: '/dashboard/menu' },
      { label: 'Add Meal',    href: '/dashboard/menu/new' },
      { label: 'Categories',  href: '/dashboard/menu/categories' },
    ],
  },
  {
    label: 'Meal Plans',
    icon: CalendarDays,
    type: 'dropdown',
    items: [
      { label: 'Subscribers',  href: '/dashboard/subscriptions' },
      { label: 'Create Plan',  href: '/dashboard/subscriptions/new' },
    ],
  },
  {
    label: 'Deliveries',
    icon: Truck,
    type: 'link',
    href: '/dashboard/deliveries',
  },
  {
    label: 'Analytics',
    icon: BarChart3,
    type: 'link',
    href: '/dashboard/analytics',
  },
  {
    label: 'Settings',
    icon: Settings,
    type: 'link',
    href: '/dashboard/settings',
  },
]