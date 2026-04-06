import type { Metadata } from "next";
import AuthNavbar from "@/components/auth/AuthNavbar";
import AuthFooter from "@/components/auth/AuthFooter";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to the DailyBread Admin Dashboard",
};

/**
 * Auth layout — wraps all (auth) routes.
 * Clean centred layout: navbar → centred content → footer.
 * Light warm theme. No sidebar — this is the public-facing auth surface.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AuthNavbar />

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-105 animate-slide-up">
          {children}
        </div>
      </main>

      <AuthFooter />
    </div>
  );
}