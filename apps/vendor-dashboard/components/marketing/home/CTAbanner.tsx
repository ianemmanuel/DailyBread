import Link from "next/link"
import { ArrowRight } from "lucide-react"

const reassuranceItems = [
  "No upfront fees",
  "No monthly subscription",
  "Commission only when you sell",
]

export default function CTABanner() {
  return (
    <section className="relative overflow-hidden bg-deep py-24 grain-overlay">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-125 w-200 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-20 right-0 h-75 w-100 rounded-full bg-accent/8 blur-3xl" />
      </div>

      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, var(--deep-foreground) 1px, transparent 0)",
          backgroundSize: "36px 36px",
        }}
      />

      <div className="section-wrapper relative z-10">
        <div className="mx-auto max-w-3xl text-center">

          {/* Live badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">
              Accepting vendors now
            </span>
          </div>

          <h2 className="font-display text-5xl font-800 leading-[1.08] tracking-tight text-deep-foreground sm:text-6xl lg:text-7xl">
            Your kitchen has{" "}
            <em className="text-gradient-cream not-italic">more to offer.</em>
            <br />
            Let's prove it.
          </h2>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-deep-foreground/55 sm:text-lg">
            Thousands of vendors have turned their passion for cooking into
            a real, growing business on DailyBread. Signup takes 5 minutes.
            Approval takes 48 hours. The revenue? That's up to your cooking.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-[0_8px_28px_var(--shadow-primary)] transition-all hover:brightness-110 hover:shadow-[0_12px_36px_var(--shadow-primary)] active:scale-95"
            >
              Apply as a Vendor
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-2xl border border-deep-foreground/20 px-8 py-4 text-base font-semibold text-deep-foreground/80 transition-all hover:border-deep-foreground/40 hover:text-deep-foreground"
            >
              Talk to our team
            </Link>
          </div>

          {/* Reassurance */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {reassuranceItems.map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-primary" />
                <span className="text-sm text-deep-foreground/40">{item}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  )
}