import Link from "next/link"

import { Button } from "@/components/ui/button"

/*
 * A meal id that resolves to nothing a customer may see. The backend answers
 * the same 404 for a dish that never existed and one that was withdrawn,
 * sent back for revision, or sold by a place that cannot trade right now
 * (principle 6), so this page does not guess which — it offers a way on.
 */
export default function MealNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <div className="w-full max-w-md space-y-6 text-center">
        <p className="eyebrow justify-center">Meal not found</p>
        <h1 className="heading-xl">This dish isn&apos;t available</h1>
        <p className="lede">
          It may have come off the menu, or the link may be incomplete. There is plenty more
          to look at in your city.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Button asChild size="lg" className="h-11 rounded-full px-6">
            {/* The doorway resolves the visitor's own market, or the directory. */}
            <Link href="/meals">Browse meals</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-11 rounded-full px-6">
            <Link href="/city">Our cities</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
