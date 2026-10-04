import {
  Categories,
  CtaBand,
  EditorialBand,
  Hero,
  HowItWorks,
  Markets,
  MealPlans
} from "@/components/home"
import { HeroCityActions } from "@/components/home/HeroCityActions"
import { HOW_IT_WORKS_INTRO, HOW_IT_WORKS_PAGE } from "@/constants/home/how-it-works-content"

//* A global marketing page— the brand, and the way into a market.

export default function HomePage() {
  return (
    <>
      {/* The hero's actions are all about WHERE: a returning customer's own
          city first, the directory beside it. "How it works" is a section of
          its own below, with a link to the full page. */}
      <Hero actions={<HeroCityActions />} />

      {/* Removes itself when empty. */}
      <Categories />
      <HowItWorks intro={HOW_IT_WORKS_INTRO} more={HOW_IT_WORKS_PAGE} />
      <EditorialBand />
      <MealPlans />
      <Markets />
      <CtaBand />
    </>
  )
}
