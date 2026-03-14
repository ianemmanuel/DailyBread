import Link from "next/link"
import MobileMenu from "./MobileMenu"
import { NavbarLinks } from "@/lib/data/marketing/navbar"


export default function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-background/90 backdrop-blur-xl shadow-[0_1px_0_var(--border)]">
      <div className="section-wrapper flex items-center justify-between py-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-[0_4px_12px_var(--shadow-primary)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 2C6.5 2 4 5 4 8c0 2 1 3.5 2 4.5V15h8v-2.5C15 11.5 16 10 16 8c0-3-2.5-6-6-6z" fill="white" fillOpacity="0.9"/>
              <path d="M7 15h6v1.5a1 1 0 01-1 1H8a1 1 0 01-1-1V15z" fill="white" fillOpacity="0.7"/>
              <path d="M8.5 8.5C8.5 7 9 6 10 5.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6"/>
            </svg>
          </div>
          <span className="font-display text-xl font-700 tracking-tight text-foreground">
            Daily<span className="text-primary">Bread</span>
          </span>
        </Link>

        {/* Desktop navigation */}
        <nav aria-label="Main navigation" className="hidden items-center gap-7 md:flex">
          {NavbarLinks.map((l) => (
            <Link key={l.id} href={l.link} className="nav-link-desktop">
              {l.title}
            </Link>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/sign-in" className="btn-outline">Log in</Link>
          <Link href="/sign-up" className="btn-primary">Join as Vendor</Link>
        </div>

        {/* Mobile menu — client component, renders burger + full overlay */}
        <MobileMenu />

      </div>
    </header>
  )
}