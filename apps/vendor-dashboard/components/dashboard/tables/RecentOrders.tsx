'use client'

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@repo/ui/components/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@repo/ui/components/table'
import { Badge } from '@repo/ui/components/badge'
import { Button } from '@repo/ui/components/button'
import { Avatar, AvatarFallback } from '@repo/ui/components/avatar'
import { ArrowUpRight, Clock, CheckCircle, Truck, ChefHat, ShoppingBag } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@repo/ui/lib/utils'

const orders = [
  { id: '#ORD-1234', customer: 'John Kamau',    category: 'meal' as const,      amount: 450,  status: 'delivered' as const,  time: '5 min ago'  },
  { id: '#ORD-1235', customer: 'Sarah Wanjiru',  category: 'meal-plan' as const, amount: 1200, status: 'in-transit' as const,  time: '12 min ago' },
  { id: '#ORD-1236', customer: 'Mike Odhiambo',  category: 'meal' as const,      amount: 780,  status: 'preparing' as const,   time: '18 min ago' },
  { id: '#ORD-1237', customer: 'Emma Njoki',     category: 'meal-plan' as const, amount: 2400, status: 'delivered' as const,   time: '25 min ago' },
  { id: '#ORD-1238', customer: 'Chris Mwangi',   category: 'meal' as const,      amount: 560,  status: 'in-transit' as const,  time: '32 min ago' },
]

const statusConfig = {
  delivered:  { icon: CheckCircle, className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  'in-transit': { icon: Truck,     className: 'border-primary/20 bg-primary/8 text-primary'       },
  preparing:  { icon: ChefHat,     className: 'border-amber-200 bg-amber-50 text-amber-700'        },
}

const categoryConfig = {
  meal:        { label: 'Single Meal', className: 'border-border/60 bg-secondary/60 text-secondary-foreground' },
  'meal-plan': { label: 'Meal Plan',   className: 'border-primary/20 bg-primary/8 text-primary'               },
}

export function RecentOrders() {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <ShoppingBag className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-base font-semibold">Recent Orders</CardTitle>
          </div>
          <CardDescription className="pl-11 text-sm">Latest orders with real-time status</CardDescription>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-muted-foreground">Live</span>
          </div>
          <Button variant="outline" size="sm" className="group h-8 gap-1 text-xs" asChild>
            <Link href="/dashboard/orders">
              View all
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      {/* overflow-x-auto here so the table scrolls independently of the page */}
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table className="min-w-140">
            <TableHeader>
              <TableRow className="border-b border-border/60 hover:bg-transparent">
                <TableHead className="px-5 py-3 text-xs font-medium text-muted-foreground">Customer</TableHead>
                <TableHead className="px-5 py-3 text-xs font-medium text-muted-foreground">Type</TableHead>
                <TableHead className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">Amount</TableHead>
                <TableHead className="px-5 py-3 text-xs font-medium text-muted-foreground">Status</TableHead>
                <TableHead className="px-5 py-3 text-xs font-medium text-muted-foreground">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const { icon: StatusIcon, className: statusClass } = statusConfig[order.status]
                const { label: catLabel, className: catClass } = categoryConfig[order.category]
                return (
                  <TableRow key={order.id} className="border-b border-border/40 transition-colors hover:bg-secondary/30 last:border-b-0">
                    <TableCell className="px-5 py-3.5">
                      <Link href={`/dashboard/orders/${order.id}`} className="group/link flex items-center gap-3">
                        <Avatar className="h-8 w-8 shrink-0 border border-border/60">
                          <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
                            {order.customer.split(' ').map((n) => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground transition-colors group-hover/link:text-primary">
                            {order.customer}
                          </p>
                          <p className="font-mono text-[11px] text-muted-foreground/70">{order.id}</p>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <Badge variant="outline" className={cn('text-xs font-medium', catClass)}>{catLabel}</Badge>
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-right">
                      <span className="text-sm font-semibold text-foreground">KSh {order.amount.toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <Badge variant="outline" className={cn('gap-1.5 text-xs font-medium', statusClass)}>
                        <StatusIcon className="h-3 w-3" />
                        <span className="capitalize">{order.status.replace('-', ' ')}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-xs">{order.time}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}