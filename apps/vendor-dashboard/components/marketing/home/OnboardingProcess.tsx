import {
  ClipboardList, ImageIcon, MapPin,
  FileText, CheckCircle2, Store,
} from "lucide-react";
import RevealOnScroll from "@repo/ui/components/custom/RevealOnScroll";

const steps = [
  {
    step: 1,
    icon: ClipboardList,
    title: "Complete your profile",
    description: "Fill in your kitchen name, bio, cuisine type, operating hours, and contact details. This is what customers will see when they discover you on the marketplace.",
    time: "~10 min",
    tag: "Business info",
  },
  {
    step: 2,
    icon: ImageIcon,
    title: "Build your menu",
    description: "Add your meals with photos, descriptions, prices, prep times, and allergen information. Quality photos drive orders — we have tips to help you take great ones.",
    time: "~20 min",
    tag: "Menu setup",
  },
  {
    step: 3,
    icon: MapPin,
    title: "Define your service area",
    description: "Set the neighbourhoods you can deliver to and your available time windows for both on-demand and scheduled meal plan deliveries.",
    time: "~5 min",
    tag: "Coverage",
  },
  {
    step: 4,
    icon: FileText,
    title: "Submit for review",
    description: "Our team reviews your kitchen for food safety compliance, menu quality, and delivery feasibility. We may reach out to verify a few details.",
    time: "24–48 hrs",
    tag: "Under review",
  },
  {
    step: 5,
    icon: CheckCircle2,
    title: "Get approved",
    description: "You receive an email and SMS confirmation. Your full vendor dashboard unlocks — orders, analytics, meal plan management, payout settings, all of it.",
    time: "Instant on approval",
    tag: "Approved ✓",
  },
  {
    step: 6,
    icon: Store,
    title: "Go live on the marketplace",
    description: "Your kitchen is now visible to customers. Orders start flowing based on your operating hours. Your first order is closer than you think.",
    time: "Your first order awaits",
    tag: "Live 🎉",
  },
];

export default function OnboardingProcess() {
  return (
    <section id="onboarding" className="py-24 bg-secondary/30">
      <div className="section-wrapper">
        {/* Header */}
        <RevealOnScroll>
          <div className="mb-16 text-center">
            <span className="inline-block rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
              Onboarding Journey
            </span>
            <h2 className="font-display mt-4 text-4xl font-800 tracking-tight text-foreground sm:text-5xl">
              What happens{" "}
              <em className="text-gradient not-italic">after you sign up</em>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              We've broken it into six clear steps. Most vendors complete
              the whole process in under an hour.
            </p>
          </div>
        </RevealOnScroll>

        {/* Steps grid — 2 col on desktop, single col mobile */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {steps.map((step, i) => (
            <RevealOnScroll key={i} delay={i * 0.08}>
              <div className="group card-lift relative flex flex-col gap-4 overflow-hidden rounded-3xl border border-border bg-card p-6">
                {/* Step number background */}
                <span className="absolute right-3 top-1 font-display text-7xl font-900 leading-none text-foreground/4 select-none">
                  {step.step}
                </span>

                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
                    {step.tag}
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-lg font-700 leading-snug text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>

                <div className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground/60">
                  <div className="h-1 w-1 rounded-full bg-primary" />
                  {step.time}
                </div>
              </div>
            </RevealOnScroll>
          ))}
        </div>

        {/* CTA */}
        <RevealOnScroll delay={0.3}>
          <div className="mt-12 text-center">
            <p className="mb-5 text-sm text-muted-foreground">
              Total time from signup to live:{" "}
              <strong className="text-foreground">under 1 hour of your time</strong>
            </p>
            <a
              href="/signup"
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground shadow-[0_6px_20px_var(--shadow-primary)] transition-all hover:brightness-110 hover:shadow-[0_8px_28px_var(--shadow-primary)] active:scale-95"
            >
              Start your application
            </a>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}