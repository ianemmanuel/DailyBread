import Image from "next/image"
import { ChefHat } from "lucide-react"

import { getHeroContent } from "@/constants/home/hero-content"
import { HeroMedia } from "./HeroMedia"
import { HeroSearch } from "./HeroSearch"

/*
 * The landing page hero: copy, address search and social proof on the left,
 * the photograph with its offer card on the right. On phones they stack, text
 * first, so the address field is on screen without scrolling.
 *
 * A Server Component. It loads its own content, so the page only has to render
 * <Hero />.
 */
export async function Hero() {
  const hero = await getHeroContent()

  return (
    <section
      aria-labelledby="hero-title"
      className="grid items-center gap-12 py-10 sm:py-14 lg:grid-cols-2 lg:gap-16 lg:py-20"
    >
      <div className="flex flex-col items-start gap-6">
        <p className="eyebrow">
          <ChefHat aria-hidden className="size-4" />
          {hero.eyebrow}
        </p>

        <h1 id="hero-title" className="heading-hero text-balance">
          {hero.headline}
          <span className="text-primary-text">.</span>
        </h1>

        <p className="lede max-w-md">{hero.lede}</p>

        <HeroSearch placeholder={hero.searchPlaceholder} />

        {hero.socialProof && (
          <div className="flex items-center gap-3 pt-1">
            <div className="flex -space-x-2.5">
              {hero.socialProof.avatars.map((avatar) => (
                <Image
                  key={avatar.src}
                  src={avatar.src}
                  alt=""
                  width={36}
                  height={36}
                  className="size-9 rounded-full border-2 border-background object-cover"
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{hero.socialProof.text}</p>
          </div>
        )}
      </div>

      <HeroMedia image={hero.image} offer={hero.offer} />
    </section>
  )
}
