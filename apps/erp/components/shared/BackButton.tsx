import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

/** The ERP's one back control: a solid slate button whose arrow nudges left on hover. */
export function BackButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button asChild variant="neutral" className="group h-9 w-fit px-3.5">
      <Link href={href}>
        <ArrowLeft className="transition-transform duration-200 group-hover:-translate-x-1" />
        {children}
      </Link>
    </Button>
  )
}
