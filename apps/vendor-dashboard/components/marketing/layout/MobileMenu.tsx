"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { NavbarLinks } from "@/lib/data/marketing/navbar"

export default function MobileMenu() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [open])

  return (
    <>

      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="relative z-50 flex h-9 w-9 items-center justify-center rounded-xl text-foreground transition-colors duration-200 hover:bg-secondary md:hidden"
      >
        <Menu
          aria-hidden="true"
          className={`absolute h-5 w-5 transition-all duration-200 ${
            open ? "opacity-0 rotate-90 scale-75" : "opacity-100 rotate-0 scale-100"
          }`}
        />
        <X
          aria-hidden="true"
          className={`absolute h-5 w-5 transition-all duration-200 ${
            open ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-75"
          }`}
        />
      </button>

      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-30 bg-foreground/20 backdrop-blur-sm transition-all duration-300 md:hidden ${
          open ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
        }`}
      />

      <div
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`fixed inset-x-0 top-0 z-40 md:hidden transition-[transform,opacity] duration-300 ease-in-out ${
          open
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex min-h-dvh flex-col bg-background shadow-[0_8px_32px_var(--shadow-warm)]">
          <div className="h-16.25 shrink-0 border-b border-border" />

          {/* Nav links */}
          <nav aria-label="Mobile navigation" className="section-wrapper flex flex-col gap-1 py-6">
            {NavbarLinks.map((l, i) => (
              <Link
                key={l.id}
                href={l.link}
                onClick={() => setOpen(false)}
                style={{ transitionDelay: open ? `${i * 50}ms` : "0ms" }}
                className={`mobile-nav-link ${
                  open ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-3"
                }`}
              >
                {l.title}
              </Link>
            ))}
          </nav>

          {/* CTAs pinned to bottom */}
          <div className="section-wrapper mt-auto flex flex-col gap-3 border-t border-border pb-10 pt-6">
            <Link href="/login" onClick={() => setOpen(false)} className="mobile-btn-outline">
              Log in
            </Link>
            <Link href="/signup" onClick={() => setOpen(false)} className="mobile-btn-primary">
              Join as Vendor
            </Link>
          </div>

        </div>
      </div>
    </>
  )
}