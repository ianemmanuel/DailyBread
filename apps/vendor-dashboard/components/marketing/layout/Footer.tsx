import Link from "next/link";

const footerLinks = {
  Platform: [
    { label: "How It Works", href: "#how-it-works" },
    { label: "What You Sell", href: "#what-you-sell" },
    { label: "Why Join", href: "#why-join" },
    { label: "Onboarding", href: "#onboarding" },
  ],
  Company: [
    { label: "About Us", href: "/about" },
    { label: "Contact", href: "/contact" },
    { label: "FAQ", href: "/faq" },
    { label: "Blog", href: "/blog" },
  ],
  Legal: [
    { label: "Terms & Conditions", href: "/terms" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Vendor Agreement", href: "/vendor-agreement" },
    { label: "Cookie Policy", href: "/cookies" },
  ],
};

export default function Footer() {
  return (
    <footer className="bg-deep text-deep-foreground">
      <div className="h-px w-full bg-linear-to-r from-transparent via-primary to-transparent opacity-40" />

      <div className="section-wrapper py-16">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="mb-4 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-[0_4px_12px_var(--shadow-primary)]">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2C6.5 2 4 5 4 8c0 2 1 3.5 2 4.5V15h8v-2.5C15 11.5 16 10 16 8c0-3-2.5-6-6-6z" fill="white" fillOpacity="0.9"/>
                  <path d="M7 15h6v1.5a1 1 0 01-1 1H8a1 1 0 01-1-1V15z" fill="white" fillOpacity="0.7"/>
                  <path d="M8.5 8.5 C8.5 7 9 6 10 5.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6"/>
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
              {[
                { label: "Twitter", icon: "𝕏" },
                { label: "Instagram", icon: "📸" },
                { label: "Facebook", icon: "f" },
                { label: "LinkedIn", icon: "in" },
              ].map((s) => (
                <Link
                  key={s.label}
                  href="#"
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-deep-foreground/10 text-xs font-bold text-deep-foreground/40 transition-colors hover:border-primary hover:text-primary"
                >
                  {s.icon}
                </Link>
              ))}
            </div>
          </div>

          {/* Links */}
          <div className="grid grid-cols-3 gap-8 lg:col-span-3">
            {Object.entries(footerLinks).map(([section, links]) => (
              <div key={section}>
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">
                  {section}
                </p>
                <ul className="flex flex-col gap-3">
                  {links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="text-sm text-deep-foreground/45 transition-colors hover:text-deep-foreground"
                      >
                        {l.label}
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
  );
}