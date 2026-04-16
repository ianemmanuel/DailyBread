import type { Metadata, Viewport } from "next"
import "./globals.css"
import { ClerkProvider } from "@clerk/nextjs"
import { Toaster }  from "@repo/ui/components/sonner"
import {
  Geist,
  Geist_Mono,
  DM_Serif_Display,
  IBM_Plex_Mono,
} from "next/font/google"


const geist = Geist({
  subsets : ["latin"],
  variable: "--font-geist",
  display : "swap",
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets : ["latin"],
  variable: "--font-ibm-mono",
  weight  : ["400", "500"],
  display : "swap",
})

const dmSerif = DM_Serif_Display({
  subsets : ["latin"],
  variable: "--font-dm-serif",
  weight  : "400",
  style   : ["normal", "italic"],
  display : "swap",
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
      className={`${geist.variable} ${ibmPlexMono.variable} ${dmSerif.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased bg-background text-foreground min-h-screen">
        <ClerkProvider>
          {children}
          <Toaster position="top-right" richColors closeButton duration={4000} />
        </ClerkProvider>
      </body>
    </html>
  )
}