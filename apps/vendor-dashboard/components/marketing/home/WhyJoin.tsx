import {
  TrendingUp, Bell, Truck, CreditCard,
  BarChart3, ShieldCheck, HeartHandshake, Users,
} from "lucide-react"
import RevealOnScroll from "@repo/ui/components/custom/RevealOnScroll"

const benefits = [
  {
    icon: TrendingUp,
    title: "Instant customer reach",
    description: "Access thousands of hungry customers in your city without spending on ads. Our marketplace does your customer acquisition.",
    color: "text-primary bg-primary/10",
  },
  {
    icon: Bell,
    title: "Predictable order flow",
    description: "Meal plan subscriptions give you 48-hour advance notice. Know exactly what to cook — zero guessing, minimal waste.",
    color: "text-amber-700 bg-amber-50",
  },
  {
    icon: Truck,
    title: "We handle delivery",
    description: "No riders to hire, no routes to plan. DailyBread's logistics network handles last-mile delivery on every order.",
    color: "text-blue-700 bg-blue-50",
  },
  {
    icon: CreditCard,
    title: "Reliable weekly payouts",
    description: "Earnings hit your M-Pesa or bank account on a clear weekly schedule. Full breakdown — no surprises, ever.",
    color: "text-green-700 bg-green-50",
  },
  {
    icon: BarChart3,
    title: "Real-time analytics",
    description: "Your vendor dashboard shows live orders, revenue trends, top-performing meals, and customer feedback in one view.",
    color: "text-purple-700 bg-purple-50",
  },
  {
    icon: ShieldCheck,
    title: "Vendor protection",
    description: "We vet customers and handle disputes. If there's an issue with an order, our support team steps in — not you.",
    color: "text-rose-700 bg-rose-50",
  },
  {
    icon: HeartHandshake,
    title: "Dedicated onboarding support",
    description: "Every vendor gets a guided setup, a knowledge base, and a WhatsApp support line. You're never building alone.",
    color: "text-teal-700 bg-teal-50",
  },
  {
    icon: Users,
    title: "Loyal subscriber base",
    description: "Meal plan customers become weekly regulars. Build real relationships and benefit from the compounding effect of subscriptions.",
    color: "text-indigo-700 bg-indigo-50",
  },
];

export default function WhyJoin() {
  return (
    <section id="why-join" className="py-24 bg-background">
      <div className="section-wrapper">
        {/* Header */}
        <RevealOnScroll>
          <div className="mb-14 text-center">
            <span className="inline-block rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
              Why DailyBread
            </span>
            <h2 className="font-display mt-4 text-4xl font-800 tracking-tight text-foreground sm:text-5xl">
              Built to help{" "}
              <em className="text-gradient not-italic">your kitchen thrive</em>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              We didn't build another food ordering app. We built a vendor-first
              platform designed around how kitchens actually work and grow.
            </p>
          </div>
        </RevealOnScroll>

        {/* Benefits grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((b, i) => (
            <RevealOnScroll key={i} delay={i * 0.06}>
              <div className="group card-lift flex flex-col gap-4 rounded-3xl border border-border bg-card p-6">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${b.color}`}>
                  <b.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-700 leading-snug text-foreground">
                    {b.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {b.description}
                  </p>
                </div>
              </div>
            </RevealOnScroll>
          ))}
        </div>

        {/* Commission callout */}
        <RevealOnScroll delay={0.2}>
          <div className="mt-8 overflow-hidden rounded-3xl bg-deep p-8 md:p-10">
            <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">
                  Transparent commission
                </p>
                <h3 className="font-display text-3xl font-700 text-deep-foreground sm:text-4xl">
                  Keep up to{" "}
                  <span className="text-gradient-cream">85% of every order</span>
                </h3>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-deep-foreground/55">
                  Our commission rewards volume. The more you sell, the better your rate.
                  Full breakdown in your vendor agreement — no hidden charges.
                </p>
              </div>
              <div className="shrink-0">
                <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full border-2 border-primary/30 bg-primary/10">
                  <span className="font-display text-4xl font-800 text-gradient-cream">85%</span>
                  <span className="text-xs text-deep-foreground/40 mt-0.5">yours to keep</span>
                </div>
              </div>
            </div>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}