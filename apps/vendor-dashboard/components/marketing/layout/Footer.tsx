import Link from "next/link"
import { FaFacebookF, FaInstagram, FaLinkedinIn } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { FooterLinks, FooterSocials } from "@/lib/data/marketing/footer"


const socialIcons = {
  Twitter:   <FaXTwitter className="h-4 w-4" />,
  Instagram: <FaInstagram className="h-4 w-4" />,
  Facebook:  <FaFacebookF   className="h-4 w-4" />,
  LinkedIn:  <FaLinkedinIn className="h-4 w-4" />,
} as const


export default function Footer() {
  return (
    <footer className="bg-deep text-deep-foreground">
      {/* Top accent line */}
      <div className="h-px w-full bg-linear-to-r from-transparent via-primary to-transparent opacity-40" />

      <div className="section-wrapper py-16">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-5">

          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="mb-4 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-[0_4px_12px_var(--shadow-primary)]">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M10 2C6.5 2 4 5 4 8c0 2 1 3.5 2 4.5V15h8v-2.5C15 11.5 16 10 16 8c0-3-2.5-6-6-6z" fill="white" fillOpacity="0.9"/>
                  <path d="M7 15h6v1.5a1 1 0 01-1 1H8a1 1 0 01-1-1V15z" fill="white" fillOpacity="0.7"/>
                  <path d="M8.5 8.5C8.5 7 9 6 10 5.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6"/>
                </svg>
              </div>
              <span className="font-display text-xl font-700 tracking-tight text-deep-foreground">
                Daily<span className="text-primary">Bread</span>
              </span>
            </Link>

            <p className="max-w-xs text-sm leading-relaxed text-deep-foreground/50">
              The vendor-first meal platform. Sell on-demand meals and
              subscription meal plans to customers in your city.
              You cook — we take care of the rest.
            </p>

            {/* Socials */}
            <div className="mt-6 flex items-center gap-3">
              {FooterSocials.map((s) => (
                <Link
                  key={s.id}
                  href={s.href}
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-deep-foreground/10 text-deep-foreground/40 transition-all duration-200 hover:border-primary hover:text-primary hover:bg-primary/10"
                >
                  {socialIcons[s.label as keyof typeof socialIcons]}
                </Link>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-3 gap-8 lg:col-span-3">
            {Object.entries(FooterLinks).map(([section, links]) => (
              <div key={section}>
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">
                  {section}
                </p>
                <ul className="flex flex-col gap-3">
                  {links.map((l) => (
                    <li key={l.id}>
                      <Link
                        href={l.link}
                        className="text-sm text-deep-foreground/45 transition-colors duration-200 hover:text-deep-foreground"
                      >
                        {l.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-deep-foreground/10 pt-8 sm:flex-row">
          <p className="text-xs text-deep-foreground/30">
            © {new Date().getFullYear()} DailyBread Technologies Ltd. All rights reserved.
          </p>
          <p className="text-xs text-deep-foreground/30">
            Built with care in{" "}
            <span className="text-primary">Nairobi, Kenya 🇰🇪</span>
          </p>
        </div>
      </div>
    </footer>
  )
}