import Link from "next/link"
import { ArrowRight, TrendingUp, Clock3, Star } from "lucide-react"
import HeroAnimation from "./HeroAnimation"

export default function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden pt-24 pb-16 flex items-center">
      {/* Background layers */}
      <div className="absolute inset-0 bg-linear-to-br from-cream-100 via-background to-cream-200" />
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)`,
          backgroundSize: "32px 32px",
        }}
      />
      {/* Warm blob top-right */}
      <div className="absolute -top-32 -right-32 h-150 w-150 rounded-full bg-linear-to-br from-primary/20 via-accent/10 to-transparent blur-3xl" />
      {/* Subtle blob bottom-left */}
      <div className="absolute -bottom-20 -left-20 h-100 w-100 rounded-full bg-linear-to-tr from-primary/10 to-transparent blur-3xl" />

      <div className="section-wrapper relative z-10">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left — copy */}
          <div className="flex flex-col items-start gap-7">
            {/* Live badge */}
            <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 shadow-[0_2px_12px_var(--shadow-warm)]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                Now accepting vendors across Nairobi
              </span>
            </div>

            {/* Headline */}
            <div>
              <h1 className="font-display text-5xl font-800 leading-[1.08] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
                Your kitchen.
                <br />
                <em className="text-gradient not-italic">Our platform.</em>
                <br />
                <span className="text-foreground/80">Their daily bread.</span>
              </h1>
            </div>

            {/* Sub */}
            <p className="max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              DailyBread connects home chefs and restaurant kitchens with
              customers who want real, local food — ordered on-demand or
              through weekly meal plan subscriptions.{" "}
              <strong className="font-semibold text-foreground">
                You cook. We handle the rest.
              </strong>
            </p>

            {/* CTAs */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-[0_6px_20px_var(--shadow-primary)] transition-all hover:brightness-110 hover:shadow-[0_8px_28px_var(--shadow-primary)] active:scale-95"
              >
                Start Selling Today
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-3.5 text-base font-semibold text-foreground ring-1 ring-border transition-all hover:bg-secondary hover:ring-primary/40"
              >
                See how it works
              </a>
            </div>

            {/* Trust pills */}
            <div className="flex flex-wrap items-center gap-3">
              {[
                { icon: TrendingUp, text: "2,400+ active vendors" },
                { icon: Clock3, text: "48hr approval" },
                { icon: Star, text: "4.8 vendor rating" },
              ].map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-foreground/70">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — animated dashboard mockup */}
          <HeroAnimation />
        </div>
      </div>
    </section>
  );
}