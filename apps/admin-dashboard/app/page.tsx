import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

/**
 * Root page — pure routing logic, no UI.
 * Authenticated  → /overview  (main dashboard)
 * Unauthenticated → /sign-in
 *
 * DailyBread Admin is an internal tool; there is no public landing page.
 */
export default async function RootPage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/overview");
  } else {
    redirect("/sign-in");
  }
}