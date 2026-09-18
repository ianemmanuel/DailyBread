import type { Metadata, Viewport } from "next"
import { Inter, Playfair_Display } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import { shadcn } from "@clerk/ui/themes"
import { Footer } from "@/components/layout/Footer"
import { Navbar } from "@/components/layout/Navbar"
import { ThemeProvider, ThemeScript } from "@/components/themes/theme-provider"
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
  // One entry per scheme, matching --background in each, so the phone's browser
  // chrome never shows a light bar over a dark page.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)",  color: "#0a0b0d" },
  ],
  width       : "device-width",
  initialScale: 1,
  // Deliberately zoomable. Pinning maximumScale is an accessibility failure on
  // a page whose whole job is small text over photographs.
}


export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col bg-background font-sans text-foreground antialiased">
        {/* FIRST child of <body>, and rendered by this SERVER component. It
            puts the `dark` class on <html> before anything paints, so there is
            no flash of the wrong theme. Rendering it here rather than from
            inside the client ThemeProvider is also what avoids React 19's
            "script tag while rendering React component" warning. */}
        <ThemeScript />

        <ThemeProvider>

          {/* Clerk's official shadcn theme reads our CSS variables, so its forms
              and menus follow light/dark on their own. The one override is the
              focus ring: the theme draws it at 50% opacity, too faint on white. */}
          <ClerkProvider
            appearance={{ theme: shadcn, variables: { colorRing: "var(--ring)" } }}
          >
            <Navbar />

            {/* The page wrapper: `.shell` is the centred max-width with
                responsive side gutters, so pages can return a fragment instead
                of repeating a wrapper div. A section that must span the full
                screen width uses the `.full-bleed` class to break out. */}
            <main id="main" className="shell flex flex-1 flex-col">
              {children}
            </main>

            <Footer />
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
