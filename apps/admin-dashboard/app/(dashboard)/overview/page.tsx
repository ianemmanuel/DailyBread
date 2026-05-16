import type { Metadata } from "next"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import {
  TrendingUp,
  ShoppingBag,
  Users,
  UtensilsCrossed,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  MapPin,
  ChevronRight,
  Bike,
  CheckCircle,
  Package,
  Truck,
  XCircle,
  Eye,
} from "lucide-react"
import { ScopeDisplay } from "@/components/dashboard/overview/ScopedDisplay"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"

export const metadata: Metadata = { title: "Overview" }

// ── Mock data — replace with real API calls ──────────────────────────────────
const MOCK_STATS = [
  {
    label: "Total Orders",
    value: "2,547",
    change: "+12.5%",
    trend: "up" as const,
    period: "vs last 7 days",
    icon: ShoppingBag,
  },
  {
    label: "Total Revenue",
    value: "₦1,284,390",
    change: "+18.2%",
    trend: "up" as const,
    period: "vs last month",
    icon: TrendingUp,
  },
  {
    label: "Active Customers",
    value: "9,842",
    change: "+8.3%",
    trend: "up" as const,
    period: "this month",
    icon: Users,
  },
  {
    label: "Active Vendors",
    value: "134",
    change: "+4",
    trend: "up" as const,
    period: "2 new this week",
    icon: UtensilsCrossed,
  },
]

const MOCK_SALES_DATA = {
  thisWeek: [450000, 620000, 580000, 710000, 890000, 940000, 780000],
  lastWeek: [380000, 540000, 510000, 650000, 780000, 820000, 690000],
  labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
}

const MOCK_ORDER_STATUS = {
  completed: 2547,
  preparing: 678,
  outForDelivery: 342,
  cancelled: 175,
}

const MOCK_RECENT_ORDERS = [
  { id: "#ORD-2547", customer: "Esther Johnson", restaurant: "Green Bowl Kitchen", amount: "₦12,450", status: "preparing", time: "2 min ago" },
  { id: "#ORD-2546", customer: "Michael Adeyemi", restaurant: "Protein Plus Cafe", amount: "₦8,750", status: "delivering", time: "15 min ago" },
  { id: "#ORD-2545", customer: "Sarah Williams", restaurant: "Classic Balance", amount: "₦15,200", status: "delivered", time: "32 min ago" },
  { id: "#ORD-2543", customer: "David Benson", restaurant: "Vegan Delight", amount: "₦9,600", status: "preparing", time: "45 min ago" },
]

const MOCK_TOP_MEAL_PLANS = [
  { name: "Weight Loss Plan", orders: 342, percentage: 18.2 },
  { name: "Protein Plus Plan", orders: 289, percentage: 14.7 },
  { name: "Classic Balance", orders: 256, percentage: 8.9 },
  { name: "Vegan Delight", orders: 198, percentage: 6.3 },
  { name: "Family Feast", orders: 162, percentage: 5.1 },
]

const MOCK_RECENT_ACTIVITY = [
  { type: "vendor", message: "New vendor registered", detail: "Green Bowl Kitchens", time: "2 min ago", icon: Users },
  { type: "order", message: "Order #ORD-2547 received", detail: "Esther Johnson", time: "2 min ago", icon: ShoppingBag },
  { type: "payment", message: "Payment received", detail: "₦12,450 from Michael Adeyemi", time: "15 min ago", icon: TrendingUp },
  { type: "update", message: "Meal plan updated", detail: "Protein Plus Plan", time: "1 hr ago", icon: Package },
  { type: "review", message: "New review received", detail: "★★★★★ 4.5", time: "2 hr ago", icon: Eye },
]

// ── Status helpers ────────────────────────────────────────────────────────────
function OrderStatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
    delivered: {
      icon: CheckCircle,
      label: "Completed",
      color: "var(--success)",
      bg: "color-mix(in oklch, var(--success) 12%, transparent)",
    },
    delivering: {
      icon: Truck,
      label: "Out for Delivery",
      color: "var(--info)",
      bg: "color-mix(in oklch, var(--info) 12%, transparent)",
    },
    preparing: {
      icon: Package,
      label: "Preparing",
      color: "var(--warning)",
      bg: "color-mix(in oklch, var(--warning) 12%, transparent)",
    },
    cancelled: {
      icon: XCircle,
      label: "Cancelled",
      color: "var(--destructive)",
      bg: "color-mix(in oklch, var(--destructive) 12%, transparent)",
    },
  }
  const c = config[status] ?? config.preparing
  const Icon = c.icon

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: c.bg, color: c.color }}
    >
      <Icon className="h-2.5 w-2.5" />
      {c.label}
    </span>
  )
}

// ── Sales Chart Component ─────────────────────────────────────────────────────
function SalesChart() {
  const maxValue = Math.max(...MOCK_SALES_DATA.thisWeek, ...MOCK_SALES_DATA.lastWeek)
  const chartHeight = 160

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="mb-4 flex items-center justify-end gap-4">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--primary)" }} />
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>This Week</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--muted)" }} />
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Last Week</span>
        </div>
      </div>

      {/* Chart bars */}
      <div className="flex items-end gap-2">
        {MOCK_SALES_DATA.labels.map((label, i) => {
          const thisWeekHeight = (MOCK_SALES_DATA.thisWeek[i] / maxValue) * chartHeight
          const lastWeekHeight = (MOCK_SALES_DATA.lastWeek[i] / maxValue) * chartHeight

          return (
            <div key={label} className="flex flex-1 flex-col items-center gap-2">
              <div className="relative flex h-[160px] w-full items-end gap-1">
                {/* Last week bar (background/muted) */}
                <div
                  className="w-1/2 rounded-t transition-all duration-300"
                  style={{
                    height: lastWeekHeight,
                    backgroundColor: "var(--muted)",
                    opacity: 0.7,
                  }}
                />
                {/* This week bar (primary) */}
                <div
                  className="w-1/2 rounded-t transition-all duration-300"
                  style={{
                    height: thisWeekHeight,
                    backgroundColor: "var(--primary)",
                    opacity: 0.85,
                  }}
                />
              </div>
              <span className="text-[10px] font-medium" style={{ color: "var(--muted-foreground)" }}>
                {label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Donut Chart Component ─────────────────────────────────────────────────────
function OrderStatusDonut() {
  const total = MOCK_ORDER_STATUS.completed + MOCK_ORDER_STATUS.preparing + MOCK_ORDER_STATUS.outForDelivery + MOCK_ORDER_STATUS.cancelled
  const segments = [
    { label: "Completed", value: MOCK_ORDER_STATUS.completed, color: "var(--success)" },
    { label: "Preparing", value: MOCK_ORDER_STATUS.preparing, color: "var(--warning)" },
    { label: "Out for Delivery", value: MOCK_ORDER_STATUS.outForDelivery, color: "var(--info)" },
    { label: "Cancelled", value: MOCK_ORDER_STATUS.cancelled, color: "var(--destructive)" },
  ]

  // Calculate stroke-dasharray and offset for a simple donut
  let accumulated = 0
  const radius = 40
  const circumference = 2 * Math.PI * radius

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="140" viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--muted)" strokeWidth="12" opacity="0.2" />
        {segments.map((segment, i) => {
          const percentage = segment.value / total
          const dash = percentage * circumference
          const offset = circumference - accumulated
          accumulated += dash

          return (
            <circle
              key={segment.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="12"
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.5s ease" }}
            />
          )
        })}
      </svg>
      <div className="mt-3 text-center">
        <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{total.toLocaleString()}</p>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Total Orders</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function OverviewPage() {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()
  const res = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/auth/session`,
    {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 300 },
    }
  )
  if (!res.ok) redirect("/sign-in")

  const { data: session }: ApiSuccess<AdminSessionData> = await res.json()

  const first = session.firstName?.trim() ?? ""
  const greetingName = first || "Admin"
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  return (
    <div className="mx-auto space-y-6 animate-slide-up">
      {/* ── Page header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
            Overview
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            {greeting}, {greetingName} 🎉
          </p>
        </div>

        <div
          className="flex items-center gap-2 self-start rounded-lg px-3 py-1.5 sm:self-auto"
          style={{
            backgroundColor: "var(--secondary)",
            border: "1px solid var(--border)",
          }}
        >
          <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary)" }} />
          <ScopeDisplay scope={session.scope} variant="inline" />
        </div>
      </div>

      {/* ── KPI stat cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {MOCK_STATS.map((stat, i) => {
          const Icon = stat.icon
          const isUp = stat.trend === "up"

          return (
            <div
              key={stat.label}
              className="group rounded-xl border p-5 transition-all duration-200 hover:shadow-md"
              style={{
                backgroundColor: "var(--card)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center justify-between">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: "color-mix(in oklch, var(--primary) 10%, transparent)" }}
                >
                  <Icon className="h-5 w-5" style={{ color: "var(--primary)" }} />
                </div>
                <div className="flex items-center gap-1">
                  {isUp ? (
                    <ArrowUpRight className="h-3.5 w-3.5" style={{ color: "var(--success)" }} />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5" style={{ color: "var(--warning)" }} />
                  )}
                  <span className="text-xs font-medium" style={{ color: isUp ? "var(--success)" : "var(--warning)" }}>
                    {stat.change}
                  </span>
                </div>
              </div>

              <p className="mt-4 text-2xl font-bold tracking-tight" style={{ color: "var(--foreground)" }}>
                {stat.value}
              </p>
              <p className="mt-0.5 text-sm" style={{ color: "var(--muted-foreground)" }}>
                {stat.label}
              </p>
              <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)", opacity: 0.6 }}>
                {stat.period}
              </p>
            </div>
          )
        })}
      </div>

      {/* ── Main grid: sales chart + order status ── */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Sales Overview — col-span 3 */}
        <div
          className="lg:col-span-3 rounded-xl border p-6"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
              Sales Overview
            </h2>
            <div className="flex gap-2">
              <button
                className="rounded-lg px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: "color-mix(in oklch, var(--primary) 10%, transparent)",
                  color: "var(--primary)",
                }}
              >
                This Week
              </button>
              <button
                className="rounded-lg px-3 py-1 text-xs font-medium transition-colors"
                style={{ color: "var(--muted-foreground)" }}
              >
                Last Week
              </button>
            </div>
          </div>
          <SalesChart />
        </div>

        {/* Order Status — col-span 2 */}
        <div
          className="lg:col-span-2 rounded-xl border p-6"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <h2 className="mb-4 text-lg font-semibold" style={{ color: "var(--foreground)" }}>
            Order Status
          </h2>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
            <OrderStatusDonut />
            <div className="flex flex-col gap-2">
              {[
                { label: "Completed", value: MOCK_ORDER_STATUS.completed, color: "var(--success)" },
                { label: "Preparing", value: MOCK_ORDER_STATUS.preparing, color: "var(--warning)" },
                { label: "Out for Delivery", value: MOCK_ORDER_STATUS.outForDelivery, color: "var(--info)" },
                { label: "Cancelled", value: MOCK_ORDER_STATUS.cancelled, color: "var(--destructive)" },
              ].map((item) => {
                const percentage = (item.value / Object.values(MOCK_ORDER_STATUS).reduce((a, b) => a + b, 0)) * 100
                return (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="h-2 w-8 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm" style={{ color: "var(--foreground)" }}>{item.label}</span>
                    <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{item.value.toLocaleString()}</span>
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>({percentage.toFixed(1)}%)</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Orders + Top Meal Plans + Activity ── */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Recent Orders — col-span 5 */}
        <div
          className="lg:col-span-5 rounded-xl border"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <div className="flex items-center justify-between border-b p-5" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
              Recent Orders
            </h2>
            <button className="flex items-center gap-1 text-sm font-medium transition-colors hover:opacity-80" style={{ color: "var(--primary)" }}>
              View all <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {MOCK_RECENT_ORDERS.map((order) => (
              <div key={order.id} className="flex items-center gap-4 p-4">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: "var(--secondary)" }}
                >
                  <Bike className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                      {order.customer}
                    </p>
                    <span className="hidden font-mono text-[10px] sm:inline" style={{ color: "var(--muted-foreground)", opacity: 0.5 }}>
                      {order.id}
                    </span>
                  </div>
                  <p className="truncate text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {order.restaurant}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                    {order.amount}
                  </span>
                  <OrderStatusBadge status={order.status} />
                </div>

                <div className="hidden shrink-0 items-center gap-1 sm:flex" style={{ color: "var(--muted-foreground)", opacity: 0.5 }}>
                  <Clock className="h-3 w-3" />
                  <span className="text-[10px]">{order.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Meal Plans — col-span 3 */}
        <div
          className="lg:col-span-3 rounded-xl border p-5"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <h2 className="mb-4 text-lg font-semibold" style={{ color: "var(--foreground)" }}>
            Top Meal Plans
          </h2>
          <div className="space-y-3">
            {MOCK_TOP_MEAL_PLANS.map((plan, i) => (
              <div key={plan.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span style={{ color: "var(--foreground)" }}>{plan.name}</span>
                  <span className="font-semibold" style={{ color: "var(--foreground)" }}>{plan.orders.toLocaleString()} orders</span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full"
                  style={{ backgroundColor: "var(--secondary)" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${plan.percentage}%`,
                      backgroundColor: i === 0 ? "var(--primary)" : "color-mix(in oklch, var(--primary) 60%, transparent)",
                    }}
                  />
                </div>
                <p className="mt-0.5 text-right text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                  {plan.percentage}%
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity — col-span 4 */}
        <div
          className="lg:col-span-4 rounded-xl border p-5"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <h2 className="mb-4 text-lg font-semibold" style={{ color: "var(--foreground)" }}>
            Recent Activity
          </h2>
          <div className="space-y-4">
            {MOCK_RECENT_ACTIVITY.map((activity, i) => {
              const Icon = activity.icon
              return (
                <div key={i} className="flex gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: "var(--secondary)" }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm" style={{ color: "var(--foreground)" }}>
                      <span className="font-medium">{activity.message}</span>
                      {activity.detail && (
                        <span className="ml-1" style={{ color: "var(--muted-foreground)" }}>— {activity.detail}</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)", opacity: 0.6 }}>
                      {activity.time}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}