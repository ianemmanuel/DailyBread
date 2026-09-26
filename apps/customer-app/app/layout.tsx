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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)",  color: "#0a0b0d" },
  ],
  width       : "device-width",
  initialScale: 1,
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
          <ClerkProvider
            appearance={{ theme: shadcn, variables: { colorRing: "var(--ring)" } }}
          >
            <Navbar />
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
