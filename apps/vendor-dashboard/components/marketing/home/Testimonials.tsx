import { Star } from "lucide-react";
import RevealOnScroll from "@repo/ui/components/custom/RevealOnScroll";

const testimonials = [
  {
    name: "Wanjiku Kamau",
    kitchen: "Wanjiku's Home Kitchen",
    location: "Westlands, Nairobi",
    initials: "WK",
    revenue: "KSh 120k/mo",
    rating: 5,
    quote:
      "Before DailyBread I was selling on WhatsApp and struggling to track orders. Now I have 45 meal plan subscribers and I know exactly what to cook every week. Income doubled in 4 months.",
    highlight: "Income doubled in 4 months",
    accentClass: "bg-primary text-primary-foreground",
  },
  {
    name: "Brian Odhiambo",
    kitchen: "Chef B's Specials",
    location: "Kilimani, Nairobi",
    initials: "BO",
    revenue: "KSh 85k/mo",
    rating: 5,
    quote:
      "The meal plan feature sold it for me. I batch-cook Sunday and Wednesday for scheduled deliveries. Zero food waste. I even hired a kitchen assistant because volume is now that consistent.",
    highlight: "Hired staff from consistent orders",
    accentClass: "bg-accent text-accent-foreground",
  },
  {
    name: "Fatuma Hassan",
    kitchen: "Mama Fatuma's Biryani",
    location: "South B, Nairobi",
    initials: "FH",
    revenue: "KSh 68k/mo",
    rating: 5,
    quote:
      "I was worried about delivery logistics but DailyBread handles everything. I just cook, hand the food to the rider, and wait for my weekly payout. Simple, clean, professional.",
    highlight: "Zero logistics headache",
    accentClass: "bg-green-600 text-white",
  },
];

const stats = [
  { value: "2,400+", label: "Active vendors" },
  { value: "98%", label: "Order completion rate" },
  { value: "4.8 / 5", label: "Avg. vendor rating" },
  { value: "KSh 2.1B", label: "Paid out to vendors" },
];

export default function Testimonials() {
  return (
    <section id="testimonials" className="py-24 bg-background">
      <div className="section-wrapper">
        {/* Header */}
        <RevealOnScroll>
          <div className="mb-14 text-center">
            <span className="inline-block rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
              Vendor Stories
            </span>
            <h2 className="font-display mt-4 text-4xl font-800 tracking-tight text-foreground sm:text-5xl">
              Kitchens growing with{" "}
              <em className="text-gradient not-italic">DailyBread</em>
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
              Real vendors. Real kitchens. Real numbers.
            </p>
          </div>
        </RevealOnScroll>

        {/* Testimonial cards */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <RevealOnScroll key={i} delay={i * 0.1}>
              <div className="group card-lift flex h-full flex-col gap-5 rounded-3xl border border-border bg-card p-6">
                {/* Stars */}
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>

                {/* Quote */}
                <blockquote className="flex-1 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-display text-3xl leading-none text-primary/30 mr-1">"</span>
                  {t.quote}
                  <span className="font-display text-3xl leading-none text-primary/30 ml-1">"</span>
                </blockquote>

                {/* Highlight */}
                <div className="rounded-xl bg-secondary px-3.5 py-2">
                  <p className="text-xs font-semibold text-foreground/80">✓ {t.highlight}</p>
                </div>

                {/* Author */}
                <div className="flex items-center gap-3 border-t border-border pt-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${t.accentClass}`}>
                    {t.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.kitchen} · {t.location}</p>
                  </div>
                  <span className="text-xs font-semibold text-primary shrink-0">{t.revenue}</span>
                </div>
              </div>
            </RevealOnScroll>
          ))}
        </div>

        {/* Stats bar */}
        <RevealOnScroll delay={0.25}>
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map((s, i) => (
              <div
                key={i}
                className="flex flex-col items-center rounded-3xl border border-border bg-secondary/50 py-6 px-4 text-center"
              >
                <span className="font-display text-3xl font-700 text-foreground">{s.value}</span>
                <span className="mt-1 text-xs text-muted-foreground font-medium">{s.label}</span>
              </div>
            ))}
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}