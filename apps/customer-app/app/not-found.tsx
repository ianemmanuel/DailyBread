import Link from "next/link"
import { UtensilsCrossed } from "lucide-react"
import { Button } from "@/components/ui/button"

/*
 * Reached for an unknown URL and — deliberately — for a restaurant that exists
 * but cannot be shown: suspended, unpublished, or in an area that cannot sell.
 * The backend 404s all of those so an opaque id is not probeable, so this page
 * says one honest thing rather than inventing a reason it was never told.
 */
export default function NotFound() {
  return (
    <div className="shell band flex flex-col items-center gap-5 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary-subtle">
        <UtensilsCrossed className="size-7 text-primary-subtle-fg" />
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="heading-lg">We couldn&apos;t find that</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          This page or restaurant isn&apos;t available. It may have closed, moved, or
          stopped delivering to your area.
        </p>
      </div>
      <Button asChild size="lg">
        <Link href="/">Back to DailyBread</Link>
      </Button>
    </div>
  )
}
