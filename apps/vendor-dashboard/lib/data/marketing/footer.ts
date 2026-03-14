export const FooterLinks = {
  Platform: [
    { id: 1, title: "How It Works",  link: "#how-it-works" },
    { id: 2, title: "What You Sell", link: "#what-you-sell" },
    { id: 3, title: "Why Join",      link: "#why-join" },
    { id: 4, title: "Onboarding",    link: "#onboarding" },
  ],
  Company: [
    { id: 5,  title: "About Us", link: "/about" },
    { id: 6,  title: "Contact",  link: "/contact" },
    { id: 7,  title: "FAQ",      link: "/faq" },
    { id: 8,  title: "Blog",     link: "/blog" },
  ],
  Legal: [
    { id: 9,  title: "Terms & Conditions", link: "/terms" },
    { id: 10, title: "Privacy Policy",     link: "/privacy" },
    { id: 11, title: "Vendor Agreement",   link: "/vendor-agreement" },
    { id: 12, title: "Cookie Policy",      link: "/cookies" },
  ],
} as const

export const FooterSocials = [
  { id: 1, label: "Twitter",   href: "#" },
  { id: 2, label: "Instagram", href: "#" },
  { id: 3, label: "Facebook",  href: "#" },
  { id: 4, label: "LinkedIn",  href: "#" },
] as const