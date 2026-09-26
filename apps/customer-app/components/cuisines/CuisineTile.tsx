import Image from "next/image"
import Link from "next/link"
import type { CustomerCuisine } from "@repo/types/customer-app"

import { cn } from "@/lib/utils"

/*
 * One cuisine as a round photograph and a name — the landing band, the global
 * directory and a city's directory all draw it this way.
 *
 * `href` is null when the tile has nowhere honest to go (a cuisine a city has
 * switched on but nobody there cooks yet): it then renders as a dimmed card,
 * not a link, so it never leads to an empty page.
 */
export function CuisineTile({
  cuisine, href, meta, size = "md",
}: {
  cuisine: CustomerCuisine
  href   : string | null
  /** A short second line — "3 places", "No places yet". */
  meta?  : string
  size?  : "md" | "lg"
}) {
  const body = (
    <>
      <span
        className={cn(
          "photo-frame photo-zoom flex items-center justify-center rounded-full",
          size === "lg" ? "size-20 sm:size-24" : "size-16 sm:size-18",
        )}
      >
        {cuisine.image ? (
          <Image
            src={cuisine.image.url}
            /* Empty: the name is right underneath. */
            alt=""
            fill
            sizes={size === "lg" ? "96px" : "72px"}
            className="object-cover"
            {...(cuisine.image.blurDataUrl
              ? { placeholder: "blur" as const, blurDataURL: cuisine.image.blurDataUrl }
              : {})}
          />
        ) : (
          /* No picture yet: a tinted initial keeps the grid even. */
          <span
            aria-hidden
            className="flex size-full items-center justify-center bg-primary/15 text-lg font-semibold text-primary-text"
          >
            {cuisine.name.charAt(0)}
          </span>
        )}
      </span>
      <span className="space-y-0.5">
        <span className="block text-sm font-medium text-foreground">{cuisine.name}</span>
        {meta && <span className="block text-xs text-muted-foreground">{meta}</span>}
      </span>
    </>
  )

  const className = "flex h-full flex-col items-center gap-3 px-3 py-4 text-center"

  return href ? (
    <Link href={href} className={cn("surface-interactive group", className)}>{body}</Link>
  ) : (
    <div className={cn("surface opacity-60", className)}>{body}</div>
  )
}
