import Link from "next/link"
import { ArrowRight } from "lucide-react"
import RevealOnScroll from "@repo/ui/components/custom/RevealOnScroll"
import FAQAccordion from "./FaqAccordion";

export const faqItems = [
  {
    q: "Who can sign up as a DailyBread vendor?",
    a: "Any person or business with a licensed kitchen can apply — home chefs with permits, restaurants, caterers, and meal-prep operations. You'll need a valid food handler's certificate and a kitchen that passes our basic photo verification.",
  },
  {
    q: "How long does approval take?",
    a: "Most applications are reviewed within 24 to 48 business hours. If we need more information our team reaches out directly. Once approved, you get an SMS and email and can go live immediately.",
  },
  {
    q: "What commission does DailyBread charge?",
    a: "Our standard rate is 15% per completed order. High-volume vendors qualify for a 12% preferred rate. There are no signup fees, listing fees, or monthly subscriptions — you only pay when you earn.",
  },
  {
    q: "Do I need my own delivery riders?",
    a: "No. DailyBread manages last-mile delivery through our own logistics network. Once your order is ready and packaged, we dispatch a rider to your kitchen. You focus entirely on cooking.",
  },
];

export default function FAQTeaser() {
  return (
    <section id="faq" className="py-24 bg-secondary/30">
      <div className="section-wrapper">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-5 lg:items-start">
          {/* Left */}
          <RevealOnScroll direction="left" className="lg:col-span-2 lg:sticky lg:top-28">
            <span className="inline-block rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
              Quick Answers
            </span>
            <h2 className="font-display mt-4 text-4xl font-800 tracking-tight text-foreground sm:text-5xl leading-tight">
              Got{" "}
              <em className="text-gradient not-italic">questions?</em>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              The most common things vendors ask before joining.
              Can't find your answer? We're one message away.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <Link
                href="/faq"
                className="inline-flex w-fit items-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-all hover:border-primary hover:text-primary"
              >
                See all FAQs
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                Ask us directly →
              </Link>
            </div>
          </RevealOnScroll>

          {/* Right — accordion */}
          <RevealOnScroll direction="right" className="lg:col-span-3">
            <FAQAccordion items={faqItems} />
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}