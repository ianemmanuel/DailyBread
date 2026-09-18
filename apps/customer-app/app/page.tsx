import { Categories } from "@/components/home/categories/Categories"
import { CtaBand } from "@/components/home/cta/CtaBand"
import { EditorialBand } from "@/components/home/editorial/EditorialBand"
import { Hero } from "@/components/home/hero/Hero"
import { NeighbourhoodKitchens } from "@/components/home/kitchens/NeighbourhoodKitchens"
import { MealPlans } from "@/components/home/meal-plans/MealPlans"
import { PopularDishes } from "@/components/home/popular/PopularDishes"

export default function HomePage() {
  return (
    <>
      <Hero />
      <Categories />
      <PopularDishes />
      <EditorialBand />
      <MealPlans />
      <NeighbourhoodKitchens />
      <CtaBand />
    </>
  )
}
