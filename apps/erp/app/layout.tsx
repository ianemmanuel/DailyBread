import type { Metadata, Viewport } from "next"
import "./globals.css"
import { ClerkProvider } from "@clerk/nextjs"
import { Toaster }  from "@/components/ui/sonner"
import {
  Geist,
  Newsreader,
  IBM_Plex_Mono,
} from "next/font/google"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ADMIN_THEME } from "@/config/theme"
import { QueryProvider } from "@/providers/query-provider"
import { cn } from "@/lib/utils";

// Body/UI — purpose-built for software interfaces (dense tables, forms,
// data-heavy screens), more precise and less "marketing-soft" than DM Sans.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
})

// Display — an elegant, editorial serif for headings, with the full weight
// range DM Sans/Fraunces had (so `font-semibold` headings still work).
// Swapped in for Fraunces, which read as playful/hospitality rather than
// the more restrained, professional tone an ops admin tool wants.
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
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
    default : "DailyBread ERP",
    template: "%s | DailyBread ERP",
  },
  description: "DailyBread ERP — operations and administration",
  robots     : { index: false, follow: false },
}

export const viewport: Viewport = {
  width       : "device-width",
  initialScale: 1,
  themeColor  : ADMIN_THEME.background,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={cn(geist.variable, newsreader.variable, ibmMono.variable, "font-sans")}
    >
      <body className="font-sans antialiased bg-background text-foreground min-h-screen">
        <ClerkProvider>
          <QueryProvider>
            <TooltipProvider>
              {children}
            </TooltipProvider>
            <Toaster position="top-right" richColors closeButton duration={4000} />
          </QueryProvider>
        </ClerkProvider>

      </body>
    </html>
  )
}