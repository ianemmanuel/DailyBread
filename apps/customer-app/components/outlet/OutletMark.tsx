import Image from "next/image"
import { UtensilsCrossed } from "lucide-react"

import { cn } from "@/lib/utils"

/*
 * A place's LOGO, drawn the same way everywhere it identifies the place —
 * place cards, meal cards, the meal page. One component, so the mark a
 * customer learns on a meal card is the mark they find on the place card.
 *
 * It was not: the place card showed only the COVER photo and the meal card
 * showed the LOGO (both the vendor profile's, both correct, just different
 * pictures), so the same restaurant looked like two. The cover stays the
 * card's photograph; this sits beside the name.
 *
 * `logoUrl` is the server's short-lived signed URL for the vendor's logo (the
 * private bucket) — there is no per-outlet logo yet. Absent, a tinted mark
 * stands in rather than an empty circle. Decorative (`alt=""`): the place's
 * name is always printed right beside it.
 */
const SIZES = {
  sm: { box: "size-6", icon: "size-3", px: 24 },
  md: { box: "size-7", icon: "size-3.5", px: 28 },
  lg: { box: "size-10", icon: "size-4", px: 40 },
} as const

export function OutletMark({ logoUrl, size = "md", className }: {
  logoUrl  : string | null
  size?    : keyof typeof SIZES
  className?: string
}) {
  const s = SIZES[size]
  return (
    <span className={cn("photo-frame relative shrink-0 rounded-full ring-1 ring-border", s.box, className)}>
      {logoUrl ? (
        <Image src={logoUrl} alt="" fill className="object-cover" sizes={`${s.px}px`} />
      ) : (
        <span className="flex size-full items-center justify-center bg-primary-subtle">
          <UtensilsCrossed aria-hidden className={cn(s.icon, "text-primary-subtle-fg")} />
        </span>
      )}
    </span>
  )
}
