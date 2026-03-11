import type { Metadata } from "next"
import { ClerkProvider } from '@clerk/nextjs'
import { Toaster } from "@repo/ui/components/sonner"
import "./globals.css"

import { Inter, IBM_Plex_Mono, Playfair_Display } from 'next/font/google'

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
    <ClerkProvider>
      <html
        lang="en"
        className={`${inter.variable} ${ibmPlexMono.variable} ${playfair.variable}`}
        suppressHydrationWarning
      >
        <body className="font-sans antialiased">
          {children}
          <Toaster
            position="top-right"
            richColors
            closeButton
            duration={4000}
          />
        </body>
      </html>
    </ClerkProvider>
  )
}