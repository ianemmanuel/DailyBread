import type { Metadata, Viewport } from "next"
import { ClerkProvider } from "@clerk/nextjs"
import { Inter, Playfair_Display } from "next/font/google"
import { Toaster } from "@repo/ui/components/sonner"
import { Providers } from "./providers"
import { SiteHeader } from "@/components/layout/SiteHeader"
import { SiteFooter } from "@/components/layout/SiteFooter"
import { getStoredLocation } from "@/lib/location/cookie"
import { isSignedIn } from "@/lib/api/server"
import "@/app/globals.css"

/*
 * Same two faces as the rest of the platform — Playfair for display, Inter for
 * everything else — so a customer who later opens the vendor dashboard meets
 * the same product. Deliberately no mono face here: nothing on a storefront is
 * a code value, and a third font is a third download.
 */
const inter = Inter({
  subsets : ["latin"],
  variable: "--font-inter",
  weight  : ["400", "500", "600", "700"],
  display : "swap",
})

const playfair = Playfair_Display({
  subsets : ["latin"],
  variable: "--font-playfair",
  weight  : ["500", "600", "700"],
  display : "swap",
})

export const metadata: Metadata = {
  title: {
    default : "DailyBread | Meal delivery",
    template : "%s | DailyBread",
  },
  description: "Order Meals from the best restaurants and commercial kitchens near you, and eat well today.",
}

export const viewport: Viewport = {
  themeColor: "#fdf8f1",
  width     : "device-width",
  initialScale: 1,
  // Deliberately zoomable. Pinning maximumScale is an accessibility failure on
  // a page whose whole job is small text over photographs.
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /*
   * Both read on the server so the header renders its final state in the first
   * paint — no flash of "Set your location" for someone who already has one,
   * and no flash of a signed-out header for someone who is signed in.
   */
  const [location, signedIn] = await Promise.all([getStoredLocation(), isSignedIn()])

  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary        : "var(--primary)",
          colorBackground     : "var(--card)",
          colorText           : "var(--foreground)",
          colorTextSecondary  : "var(--muted-foreground)",
          colorInputBackground: "var(--input)",
          colorInputText      : "var(--foreground)",
          colorDanger         : "var(--destructive)",
          borderRadius        : "var(--radius-md)",
          fontFamily          : "var(--font-inter)",
        },
        elements: {
          // Clerk's own OS-level colour-scheme detection would otherwise leave
          // these looking transparent; this app is light-only.
          socialButtonsBlockButton: "bg-card border border-border shadow-xs",
          dividerLine             : "bg-border",
        },
      }}
    >
      <html
        lang="en"
        className={`${inter.variable} ${playfair.variable}`}
        // Browser extensions routinely add attributes to <html> before React
        // hydrates. Suppresses that one element only — nothing below it.
        suppressHydrationWarning
      >
        <body className="font-sans antialiased">
          <Providers>
            <div className="flex min-h-dvh flex-col">
              <SiteHeader location={location} signedIn={signedIn} />
              <main className="flex-1">{children}</main>
              <SiteFooter />
            </div>
            <Toaster position="top-center" richColors closeButton duration={4000} />
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  )
}
