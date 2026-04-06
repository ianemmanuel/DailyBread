import { SignIn } from "@clerk/nextjs";

/**
 * Sign-in page.
 * Uses Clerk's <SignIn /> as-is.
 * Visual customisation is handled in the Clerk Dashboard.
 */
export default function SignInPage() {
  return <SignIn />;
}