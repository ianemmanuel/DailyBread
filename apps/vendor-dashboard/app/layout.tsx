import type { Metadata } from "next"
import { ClerkProvider } from '@clerk/nextjs'
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

import { Inter, IBM_Plex_Mono, Playfair_Display } from 'next/font/google'
import { Providers } from "./providers"

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-ibm-mono',
  weight: ['400', '500', '700'],
  display: 'swap',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  weight: ['400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: "DailyBread | Vendor Dashboard",
  description: "DailyBread Vendor Dashboard | Manage Your Meals and Meal Plans.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: 'var(--primary)',
          colorBackground: 'var(--card)',
          colorText: 'var(--foreground)',
          colorTextSecondary: 'var(--muted-foreground)',
          colorInputBackground: 'var(--input)',
          colorInputText: 'var(--foreground)',
          colorDanger: 'var(--destructive)',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-inter)',
        },
        elements: {
          // Clerk's own OS-level color-scheme detection can otherwise leave
          // these looking transparent — pin them explicitly since the app
          // itself is light-only.
          socialButtonsBlockButton: 'bg-card border border-border shadow-xs',
          dividerLine: 'bg-border',
        },
      }}
    >
      <html
        lang="en"
        className={`${inter.variable} ${ibmPlexMono.variable} ${playfair.variable}`}
        // Kept after next-themes was removed: browser extensions routinely add
        // attributes to <html> before React hydrates, and this suppresses that
        // one element only -- it does not hide mismatches anywhere below.
        suppressHydrationWarning
      >
        <body className="font-sans antialiased">
          {/* No ThemeProvider: this app is light-only, and next-themes was
              doing nothing but forcing the theme it already had. Its three-
              option toggle could never change anything, and it sat between the
              server layout and every client component below it -- which is
              where the Radix useId hydration mismatch was coming from. */}
          <Providers>
            {children}
            <Toaster
              position="top-right"
              richColors
              closeButton
              duration={4000}
            />
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  )
}