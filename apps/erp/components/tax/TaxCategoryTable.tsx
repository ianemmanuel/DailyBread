"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { TaxCategoryActions } from "./TaxCategoryActions"
import type { TaxCategory } from "@/types/tax.types"

/*
 * The catalog as a table. Client-side because each row carries its own
 * edit/suspend controls; the list itself is server-fetched and passed in.
 *
 * The two usage counts are the reason there is no delete anywhere on this
 * screen, so they are shown rather than hidden: suspending a category leaves
 * every rate and every dish that names it exactly as they were.
 */

interface Props {
  categories: TaxCategory[]
  canManage : boolean
}

export function TaxCategoryTable({ categories, canManage }: Props) {
  return (
    <div className="admin-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium text-right">Countries</th>
              <th className="px-4 py-3 font-medium text-right">Meals</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id} className="border-b last:border-0 align-top">
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{category.name}</p>
                  {category.description && (
                    <p className="mt-0.5 max-w-md text-xs leading-relaxed text-muted-foreground">
                      {category.description}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{category.code}</code>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{category._count.countryRates}</td>
                <td className="px-4 py-3 text-right tabular-nums">{category._count.menuItems}</td>
                <td className="px-4 py-3">
                  <Badge variant={category.status === "ACTIVE" ? "secondary" : "outline"}>
                    {category.status === "ACTIVE" ? "Active" : "Suspended"}
                  </Badge>
                </td>
                {canManage && (
                  <td className="px-4 py-3 text-right">
                    <TaxCategoryActions category={category} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
