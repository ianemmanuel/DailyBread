import type { Metadata, Viewport } from "next"
import "./globals.css"
import { ClerkProvider } from "@clerk/nextjs"
import { Toaster }  from "@/components/ui/sonner"
import {
  DM_Sans,
  Fraunces,
  IBM_Plex_Mono, Geist } from "next/font/google"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ADMIN_THEME } from "@/config/theme"
import { ThemeProvider } from "@/components/shared/theme/theme-provider"
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
    default : "DailyBread Operations",
    template: "%s | DailyBread Ops",
  },
  description: "DailyBread operations and administration dashboard",
  robots     : { index: false, follow: false },
}

export const viewport: Viewport = {
  width       : "device-width",
  initialScale: 1,
  themeColor  : [
    { media: "(prefers-color-scheme: light)", color: ADMIN_THEME.lightBg },
    { media: "(prefers-color-scheme: dark)",  color: ADMIN_THEME.darkBg },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={cn(dmSans.variable, fraunces.variable, ibmMono.variable, "font-sans", geist.variable)}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased bg-background text-foreground min-h-screen">
        <ClerkProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider>
              {children}
            </TooltipProvider>
            <Toaster position="top-right" richColors closeButton duration={4000} />
          </ThemeProvider>
        </ClerkProvider>

      </body>
    </html>
  )
}