import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/*
 * The DailyBread brand — the ONE place the dashboard draws it. The sidebar,
 * the mobile sheet, the phone navbar and the footer all render this.
 *
 * For now the app's NAME is the logo (explicit direction), the same wordmark
 * the customer app shows: Playfair Display 700, "Daily" #121417 + "Bread"
 * #ac5107, served as WebP from `public/brand/`. This app is light-only, so
 * there is one file. `compact` (the collapsed rail, where the wordmark cannot
 * fit) uses the "DB" monogram — the favicon's mark.
 *
 * `unoptimized`: the files are already small WebPs at ~3× display size. To
 * replace the logo, swap the files (keep the names) or the sizes below.
 */
const WORDMARK = { src: '/brand/dailybread-wordmark.webp', width: 463, height: 96 } as const
const MONOGRAM = { src: '/brand/dailybread-monogram.webp', width: 96, height: 96 } as const

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link
      href="/dashboard"
      aria-label="DailyBread — dashboard"
      className={cn(
        'flex min-w-0 shrink-0 items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        className,
      )}
    >
      {compact ? (
        <Image {...MONOGRAM} alt="" unoptimized className="size-8 rounded-lg" />
      ) : (
        <Image {...WORDMARK} alt="" unoptimized className="h-6 w-auto" />
      )}
    </Link>
  )
}
