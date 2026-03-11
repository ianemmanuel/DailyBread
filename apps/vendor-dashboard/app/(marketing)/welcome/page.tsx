import Hero from "@/components/marketing/home/Hero"
import HowItWorks from "@/components/marketing/home/HowItWorks"
import WhatYouSell from "@/components/marketing/home/WhatYouSell"
import WhyJoin from "@/components/marketing/home/WhyJoin"
import OnboardingProcess from "@/components/marketing/home/OnboardingProcess"
import Testimonials from "@/components/marketing/home/Testimonials"
import FAQTeaser from "@/components/marketing/home/FAQTeaser";
import CTABanner from "@/components/marketing/home/CTAbanner";


export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <WhatYouSell />
      <WhyJoin />
      <OnboardingProcess />
      <Testimonials />
      <FAQTeaser />
      <CTABanner />
    </>
  );
}