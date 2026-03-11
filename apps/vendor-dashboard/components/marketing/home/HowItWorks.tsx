import { UserPlus, ClipboardCheck, Rocket } from "lucide-react";
import RevealOnScroll from "@repo/ui/components/custom/RevealOnScroll";

const steps = [
  {
    number: "01",
    icon: UserPlus,
    title: "Create your vendor account",
    description:
      "Sign up in minutes. Tell us about your kitchen — what you cook, how many meals you can handle, and where you're based. No lengthy forms.",
    badge: "Free to join",
    color: "bg-primary/10 text-primary",
    border: "border-primary/20",
  },
  {
    number: "02",
    icon: ClipboardCheck,
    title: "Complete onboarding & get approved",
    description:
      "Set up your profile, upload your menu with photos and pricing, and define your delivery windows. Our team reviews and approves you within 48 hours.",
    badge: "~48hrs approval",
    color: "bg-accent/30 text-accent-foreground",
    border: "border-accent/30",
  },
  {
    number: "03",
    icon: Rocket,
    title: "Go live & start earning",
    description:
      "Your kitchen appears in the DailyBread marketplace. Receive on-demand orders and meal plan subscriptions. Cook, hand off, get paid.",
    badge: "Instant go-live",
    color: "bg-green-100 text-green-700",
    border: "border-green-200",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-secondary/40">
      <div className="section-wrapper">
        {/* Header */}
        <RevealOnScroll>
          <div className="mb-14 text-center">
            <span className="inline-block rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
              The Process
            </span>
            <h2 className="font-display mt-4 text-4xl font-800 tracking-tight text-foreground sm:text-5xl">
              From signup to{" "}
              <em className="text-gradient not-italic">first order</em>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              Three clear steps separate you from a growing customer base.
              We've kept onboarding lean on purpose — your kitchen, not our paperwork.
            </p>
          </div>
        </RevealOnScroll>

        {/* Steps */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {steps.map((step, i) => (
            <RevealOnScroll key={i} delay={i * 0.12}>
              <div className={`group card-lift relative overflow-hidden rounded-3xl border ${step.border} bg-card p-7 flex flex-col gap-5`}>
                {/* Large background number */}
                <span className="absolute -right-2 -top-3 font-display text-8xl font-900 leading-none text-foreground/[0.04] select-none">
                  {step.number}
                </span>

                {/* Icon */}
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${step.color}`}>
                  <step.icon className="h-6 w-6" />
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="font-display text-xl font-700 leading-snug text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>

                <div className="mt-auto">
                  <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${step.color}`}>
                    {step.badge}
                  </span>
                </div>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}