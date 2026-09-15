import type { Metadata, Viewport } from "next"
import { Inter, Playfair_Display } from "next/font/google"
import { Navbar } from "@/components/layout/Navbar"
import { ClerkProvider } from "@clerk/nextjs"
import "./globals.css"

const inter = Inter({
  subsets : ["latin"],
  variable: "--font-inter",
  display : "swap",
})

const playfair = Playfair_Display({
  subsets : ["latin"],
  variable: "--font-playfair",
  display : "swap",
})

/*
 * metadataBase resolves relative Open Graph and canonical URLs to absolute
 * ones. Without it a share card's image quietly fails to resolve in production
 * — the kind of bug nobody notices until a link is posted somewhere public.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title       : {
    default : "DailyBread — Good food, right when you want it",
    template: "%s | DailyBread",
  },
  description : "Discover meals from great local kitchens and restaurants near you, delivered to your door.",
  openGraph   : {
    type    : "website",
    siteName: "DailyBread",
    locale  : "en",
  },
}

export const viewport: Viewport = {
  // Matches --background, so the browser chrome blends into the page on mobile.
  themeColor  : "#faf7f3",
  width       : "device-width",
  initialScale: 1,
  // Deliberately zoomable. Pinning maximumScale is an accessibility failure on
  // a page whose whole job is small text over photographs.
}



export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>){
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col bg-background font-sans text-foreground antialiased">
        {/*
          * Deliberately NOT `dynamic`. ClerkProvider renders statically by
          * default, which is what keeps `/` a static route — passing `dynamic`
          * resolves auth on the server and opts EVERY route into dynamic
          * rendering. AuthActions explains the trade.
          *
          * Colours are literal hex, not var(--token): Clerk parses each one to
          * derive its own shades and alpha variants, and cannot do that with an
          * unresolved custom property. They mirror globals.css and must be
          * updated alongside it.
          */}
        <ClerkProvider>
          {/* A same-page fragment jump — the one thing a raw anchor is still the
            right element for, since next/link would route for what the browser
            already does natively. Invisible until focused. */}
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-60 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
          >
            Skip to content
          </a>

          <Navbar />

          <main id="main" className="flex-1">
            {children}
          </main>
        </ClerkProvider>
      </body>
    </html>
  )
}
