import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { 
  Categories, 
  CtaBand,
  EditorialBand,
  Hero,
  HowItWorks,
  Markets,
  MealPlans
} from "@/components/home"
import { CityDirectoryLabel } from "@/components/home/CityDirectoryLabel"
import { ContinueToCity } from "@/components/home/ContinueToCity"
import { Button } from "@/components/ui/button"

//* A global marketing page— the brand, and the way into a market.

export default function HomePage() {
  return (
    <>
      <Hero
        actions={
          <>
            <Button asChild size="lg" className="h-12 rounded-full px-7 text-base">
              <Link href="/city">
                {/* "Choose your city", or — once the customer has one —
                    "Explore other cities". */}
                <CityDirectoryLabel />
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="brand" size="lg" className="h-12 rounded-full px-6 text-base">
              <Link href="/about">How DailyBread works</Link>
            </Button>
          </>
        }
      />

      {/* A returning customer's way back into their own city. Client-only and
          absent for a first visit, so `/` stays static and global. */}
      <ContinueToCity />

      {/* Removes itself when empty. */}
      <Categories />
      <HowItWorks />
      <EditorialBand />
      <MealPlans />
      <Markets />
      <CtaBand />
    </>
  )
}
