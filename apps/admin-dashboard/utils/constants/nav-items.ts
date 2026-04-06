import {
  LayoutDashboard,
  Store,
  Users,
  Truck,
  HeadphonesIcon,
  Landmark,
  ShieldCheck,
  Settings,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  label : string
  href  : string
  icon  : LucideIcon
  badge?: string
}

export interface NavSection {
  title : string
  items : NavItem[]
}

/**
 * Sidebar navigation — single source of truth.
 * Add a department here; both desktop sidebar and mobile sheet update automatically.
 */
export const navSections: NavSection[] = [
  {
    title: "General",
    items: [
      { label: "Overview",  href: "/overview",  icon: LayoutDashboard },
    ],
  },
  {
    title: "Departments",
    items: [
      { label: "Vendors",   href: "/vendors",   icon: Store },
      { label: "Couriers",  href: "/couriers",  icon: Truck },
      { label: "Customers", href: "/customers", icon: Users },
      { label: "Support",   href: "/support",   icon: HeadphonesIcon },
      { label: "Finance",   href: "/finance",   icon: Landmark },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Identity & Access", href: "/identity", icon: ShieldCheck },
      { label: "Settings",          href: "/settings",  icon: Settings },
    ],
  },
]