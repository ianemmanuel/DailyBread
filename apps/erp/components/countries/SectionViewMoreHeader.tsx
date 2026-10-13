import Link from "next/link"

interface Props {
  title: string
  href : string
  linkLabel?: string
}

/** The repeated "Section Title" + "View more →" row above a preview block. */
export function SectionViewMoreHeader({ title, href, linkLabel = "View more" }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <Link href={href} className="view-all-link">
        {linkLabel} →
      </Link>
    </div>
  )
}
