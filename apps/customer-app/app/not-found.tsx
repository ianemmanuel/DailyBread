import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <div className="w-full max-w-md space-y-6 text-center">
        <p className="eyebrow justify-center">404</p>
        <h1 className="heading-xl">We couldn&apos;t find that</h1>
        <p className="lede">
          This page isn&apos;t available. Try searching for something else or go back to the homepage.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Button asChild size="lg" className="h-11 rounded-full px-6">
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
