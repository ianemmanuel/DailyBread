import type { Metadata, Viewport } from "next"
import "./globals.css"
import { ClerkProvider } from "@clerk/nextjs"
import { Toaster }  from "@repo/ui/components/sonner"
import {
  DM_Sans,
  Fraunces,
  IBM_Plex_Mono,
} from "next/font/google"
import { TooltipProvider } from "@repo/ui/components/tooltip"


const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
})

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
})

const ibmMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-mono",
  weight: ["400", "500"],
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default : "DailyBread Admin",
    template: "%s | DailyBread Admin",
  },
  description: "DailyBread operations and administration dashboard",
  robots     : { index: false, follow: false },
}

export const viewport: Viewport = {
  width       : "device-width",
  initialScale: 1,
  themeColor  : [
    { media: "(prefers-color-scheme: light)", color: "#f9f9fb" },
    { media: "(prefers-color-scheme: dark)",  color: "#111116" },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${fraunces.variable} ${ibmMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased bg-background text-foreground min-h-screen">
        <ClerkProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
          <Toaster position="top-right" richColors closeButton duration={4000} />
        </ClerkProvider>
      </body>
    </html>
  )
}