"use client"

import { useLinkStatus } from "next/link"
import { LoaderCircle } from "lucide-react"

/*
 * Feedback on a card while its link navigates.
 *
 * `/meals/[mealId]` has no `loading.tsx` ON PURPOSE: a loading boundary
 * starts streaming before the page can call notFound(), so a missing or
 * hidden meal answered HTTP 200. Without it the page resolves before the
 * response begins and a missing meal is a real 404 — and Next's documented
 * companion for "a dynamic route with no loading.js" is useLinkStatus on the
 * link itself. Render it as the LAST child of a `relative` <Link>.
 */
export function LinkPending() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return (
    <span aria-hidden className="absolute inset-0 z-10 flex items-center justify-center bg-background/45 backdrop-blur-[1px]">
      <LoaderCircle className="size-6 animate-spin text-foreground/70 motion-reduce:animate-none" />
    </span>
  )
}
