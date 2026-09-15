'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Star } from 'lucide-react';

const vendors = [
  {
    name: 'Pizza Palace',
    orders: 1234,
    revenue: '$23,450',
    rating: 4.8,
    status: 'active',
    initials: 'PP',
  },
  {
    name: 'Burger Boss',
    orders: 987,
    revenue: '$18,230',
    rating: 4.6,
    status: 'active',
    initials: 'BB',
  },
  {
    name: 'Sushi Supreme',
    orders: 856,
    revenue: '$31,200',
    rating: 4.9,
    status: 'active',
    initials: 'SS',
  },
  {
    name: 'Taco Town',
    orders: 745,
    revenue: '$14,890',
    rating: 4.5,
    status: 'active',
    initials: 'TT',
  },
  {
    name: 'Pasta Paradise',
    orders: 623,
    revenue: '$19,450',
    rating: 4.7,
    status: 'active',
    initials: 'PP',
  },
];

export function TopVendors() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Performing Vendors</CardTitle>
        <p className="text-sm text-muted-foreground">Highest revenue vendors this month</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {vendors.map((vendor, index) => (
            <div key={vendor.name} className="flex items-center gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-black">
                {index + 1}
              </div>
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-gradient-to-br from-amber-400/20 to-orange-500/20 text-amber-600 font-semibold">
                  {vendor.initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{vendor.name}</p>
                  <Badge variant="outline" className="text-xs">
                    {vendor.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-1">
                  <p className="text-sm text-muted-foreground">{vendor.orders} orders</p>
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="text-sm text-muted-foreground">{vendor.rating}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-emerald-500">{vendor.revenue}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
