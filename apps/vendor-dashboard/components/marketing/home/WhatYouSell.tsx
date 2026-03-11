import { Zap, CalendarDays, Check } from "lucide-react";
import RevealOnScroll from "@repo/ui/components/custom/RevealOnScroll"

const onDemand = [
  "Customer orders — you cook within your prep window",
  "Set your own menu, availability and daily capacity",
  "Great for building your reputation and customer base",
  "Per-order payouts, fast settlement",
];

const mealPlan = [
  "Customers subscribe weekly or monthly to your meal plans",
  "Know your exact order volume 48hrs in advance",
  "Batch-cook efficiently, deliver on a set schedule",
  "Recurring income — subscribers pay every cycle",
];

export default function WhatYouSell() {
  return (
    <section
      id="what-you-sell"
      className="relative py-24 overflow-hidden grain-overlay"
      style={{
        background: "linear-gradient(160deg, oklch(0.93 0.04 55) 0%, oklch(0.96 0.025 62) 40%, oklch(0.91 0.05 50) 100%)",
      }}
    >
      {/* Soft ambient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-125 w-125 rounded-full bg-terracotta/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-100 w-100 rounded-full bg-gold/15 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 h-75 w-150 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/6 blur-3xl" />
      </div>

      <div className="section-wrapper relative z-10">
        {/* Header */}
        <RevealOnScroll>
          <div className="mb-14 text-center">
            <span className="inline-block rounded-full border border-terracotta-dark/20 bg-terracotta/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-terracotta-dark">
              Two Revenue Streams
            </span>
            <h2 className="font-display mt-4 text-4xl font-800 tracking-tight text-foreground sm:text-5xl">
              Sell meals your way,{" "}
              <em className="text-gradient not-italic">every day</em>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-foreground/60">
              DailyBread gives your kitchen two powerful channels.
              Run one or both — each one built around how real kitchens operate.
            </p>
          </div>
        </RevealOnScroll>

        {/* Cards */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

          {/* On-demand */}
          <RevealOnScroll delay={0.1} direction="left">
            <div className="group flex h-full flex-col gap-6 rounded-3xl border border-white/60 bg-white/70 p-7 shadow-[0_4px_24px_oklch(0.72_0.12_48/12%)] backdrop-blur-sm transition-all duration-300 hover:border-white/80 hover:bg-white/80 hover:shadow-[0_8px_32px_oklch(0.72_0.12_48/18%)]">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary shadow-[0_4px_14px_var(--shadow-primary)]">
                  <Zap className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-display text-2xl font-700 text-foreground">
                    On-Demand Meals
                  </h3>
                  <p className="text-sm font-medium text-primary">Cook when customers order</p>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-foreground/65">
                List your meals on the DailyBread marketplace and receive individual orders
                from customers nearby. Like Uber Eats — but you set the schedule,
                control the capacity, and keep more of the money.
              </p>

              <ul className="flex flex-col gap-2.5">
                {onDemand.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 border border-primary/20">
                      <Check className="h-2.5 w-2.5 text-primary" />
                    </div>
                    <span className="text-sm text-foreground/70">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto rounded-2xl border border-primary/15 bg-primary/8 px-4 py-3">
                <p className="text-xs font-medium text-primary">
                  💡 Best for: Home chefs, small kitchens, weekday specials
                </p>
              </div>
            </div>
          </RevealOnScroll>

          {/* Meal plans */}
          <RevealOnScroll delay={0.2} direction="right">
            <div className="group relative flex h-full flex-col gap-6 rounded-3xl border border-gold/30 bg-white/70 p-7 shadow-[0_4px_24px_oklch(0.80_0.13_72/12%)] backdrop-blur-sm transition-all duration-300 hover:border-gold/50 hover:bg-white/80 -hover:shadow-[0_8px_32px_oklch(0.80_0.13_72/18%)]">
              <div className="absolute right-5 top-5 rounded-full border border-gold-dark/20 bg-gold/20 px-2.5 py-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gold-dark">
                  Recommended
                </span>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold shadow-[0_4px_14px_oklch(0.80_0.13_72/30%)]">
                  <CalendarDays className="h-6 w-6 text-foreground/80" />
                </div>
                <div>
                  <h3 className="font-display text-2xl font-700 text-foreground">
                    Meal Plan Subscriptions
                  </h3>
                  <p className="text-sm font-medium text-gold-dark">Predictable, recurring revenue</p>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-foreground/65">
                Offer weekly or monthly meal plans that customers subscribe to.
                You know your order volume days in advance — prep in batches,
                deliver on schedule. Like HelloFresh, but your recipes, your kitchen.
              </p>

              <ul className="flex flex-col gap-2.5">
                {mealPlan.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gold/20 border border-gold-dark/20">
                      <Check className="h-2.5 w-2.5 text-gold-dark" />
                    </div>
                    <span className="text-sm text-foreground/70">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto rounded-2xl border border-gold/20 bg-gold/10 px-4 py-3">
                <p className="text-xs font-medium text-gold-dark">
                  💡 Best for: Established kitchens, caterers, meal-prep vendors
                </p>
              </div>
            </div>
          </RevealOnScroll>
        </div>

        {/* Pro tip */}
        <RevealOnScroll delay={0.3}>
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/60 bg-white/50 px-5 py-4 backdrop-blur-sm">
            <span className="text-xl">🎯</span>
            <p className="text-sm text-foreground/65">
              <strong className="text-foreground">Pro tip:</strong>{" "}
              Most successful DailyBread vendors run both. On-demand fills your days,
              meal plans give you a revenue floor you can build on.
            </p>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}