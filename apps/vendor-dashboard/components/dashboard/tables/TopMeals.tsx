'use client'

import * as React from 'react'
import Link from 'next/link'
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/table'
import { Button } from '@repo/ui/components/button'
import { Badge } from '@repo/ui/components/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar'
import { ArrowUpRight, TrendingUp, TrendingDown, Utensils } from 'lucide-react'

export type Meal = {
  id: string
  name: string
  image: string
  orders: number
  revenue: number
  category: string
  growth: number
}

const data: Meal[] = [
  { id: '1', name: 'Pilau & Kachumbari',   image: '', orders: 342, revenue: 85420, category: 'Kenyan',    growth: 12.5 },
  { id: '2', name: 'Nyama Choma Platter',  image: '', orders: 298, revenue: 74500, category: 'Grill',     growth: 8.3  },
  { id: '3', name: 'Ugali & Sukuma',       image: '', orders: 267, revenue: 53400, category: 'Kenyan',    growth: 15.2 },
  { id: '4', name: 'Beef Stew & Rice',     image: '', orders: 234, revenue: 46800, category: 'Homestyle', growth: -2.3 },
  { id: '5', name: 'Chicken Tikka Wrap',   image: '', orders: 198, revenue: 59400, category: 'Fusion',    growth: 0    },
]

const columns: ColumnDef<Meal>[] = [
  {
    accessorKey: 'name',
    header: 'Meal',
    cell: ({ row }) => {
      const meal = row.original
      const initials = meal.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
      return (
        <Link href={`/dashboard/menu/${meal.id}`} className="group/link flex items-center gap-3 py-1">
          <Avatar className="h-9 w-9 shrink-0 rounded-lg border border-border/60">
            <AvatarImage src={meal.image} alt={meal.name} />
            <AvatarFallback className="rounded-lg bg-secondary text-xs font-semibold text-secondary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground transition-colors group-hover/link:text-primary">
              {meal.name}
            </p>
            <Badge variant="secondary" className="mt-0.5 h-4 bg-secondary/60 px-1.5 text-[10px] text-muted-foreground">
              {meal.category}
            </Badge>
          </div>
        </Link>
      )
    },
  },
  {
    accessorKey: 'orders',
    header: () => <span className="block text-right">Orders</span>,
    cell: ({ row }) => (
      <div className="text-right text-sm font-medium text-foreground">
        {(row.getValue('orders') as number).toLocaleString()}
      </div>
    ),
  },
  {
    accessorKey: 'revenue',
    header: () => <span className="block text-right">Revenue</span>,
    cell: ({ row }) => {
      const revenue = row.getValue('revenue') as number
      const growth = row.original.growth
      const isPositive = growth > 0
      const isNeutral = growth === 0
      return (
        <div className="text-right">
          <div className="text-sm font-semibold text-foreground">
            KSh {revenue.toLocaleString()}
          </div>
          <div className={`mt-0.5 flex items-center justify-end gap-1 text-xs font-medium ${
            isNeutral ? 'text-muted-foreground' : isPositive ? 'text-emerald-600' : 'text-destructive'
          }`}>
            {!isNeutral && (isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />)}
            <span>{isNeutral ? '±0%' : `${growth > 0 ? '+' : ''}${growth}%`}</span>
          </div>
        </div>
      )
    },
  },
]

export function TopMeals() {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Utensils className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-base font-semibold">Top Performing Meals</CardTitle>
          </div>
          <CardDescription className="pl-11 text-sm">Best-sellers this month</CardDescription>
        </div>
        <Button variant="outline" size="sm" className="group h-8 shrink-0 gap-1 text-xs" asChild>
          <Link href="/dashboard/analytics/meals">
            View all
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table className="min-w-120">
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="border-b border-border/60 hover:bg-transparent">
                  {hg.headers.map((h) => (
                    <TableHead key={h.id} className="px-5 py-3 text-xs font-medium text-muted-foreground">
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="border-b border-border/40 transition-colors hover:bg-secondary/30 last:border-b-0">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-5 py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                    No meals found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}