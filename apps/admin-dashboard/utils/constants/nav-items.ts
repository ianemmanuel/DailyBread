import {
  LayoutDashboard,
  ShoppingBag,
  Store,
  Users,
  Truck,
  HeadphonesIcon,
  Landmark,
  ShieldCheck,
  Settings,
  UtensilsCrossed,
  BarChart3,
  Star,
  type LucideIcon,
  Building2,
  Flag,
} from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

/**
 * navSections — used by SidebarNav.
 * Grouped to match the light theme reference image layout.
 * Section titles are shown in expanded mode, hidden when collapsed.
 * In collapsed mode, items are shown as icon-only with tooltip labels.
 */
export const navSections: NavSection[] = [
  {
    title: "General",
    items: [
      { label: "Overview",   href: "/overview",   icon: LayoutDashboard },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Orders",     href: "/orders",     icon: ShoppingBag },
      { label: "Vendors",    href: "/vendors",    icon: Store },
      { label: "Customers",  href: "/customers",  icon: Users },
      { label: "Meal Plans", href: "/meal-plans", icon: UtensilsCrossed },
      { label: "Deliveries", href: "/deliveries", icon: Truck },
    ],
  },
  {
    title: "Locations",
    items: [
      { label: "Countries",     href: "/countries", icon: Flag },
      { label: "Cities",    href: "/cities",    icon: Building2 },
    ],
  },
  {
    title: "Insights",
    items: [
      { label: "Analytics",  href: "/analytics",  icon: BarChart3 },
      { label: "Reviews",    href: "/reviews",    icon: Star },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Payments",   href: "/payments",   icon: Landmark },
      { label: "Support",    href: "/support",    icon: HeadphonesIcon },
      { label: "Access",     href: "/identity",   icon: ShieldCheck },
      { label: "Settings",   href: "/settings",   icon: Settings },
    ],
  },
]