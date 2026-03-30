import { SignIn } from "@clerk/nextjs";

/**
 * Sign-in page.
 *
 * Renders Clerk's <SignIn /> component directly.
 * Visual styling is handled in two places:
 *   1. Clerk Dashboard → Customization → (set colours / logo there)
 *   2. The `appearance.variables` prop below — maps our CSS tokens
 *      to Clerk's theming system so it matches the admin theme.
 *
 * We do NOT use CSS class overrides here. Clerk's variable system
 * is the correct, stable API for theming their components.
 */
export default function SignInPage() {
  return (
    <SignIn
      appearance={{
        variables: {
          colorPrimary:         "oklch(0.65 0.17 42)",
          colorBackground:      "oklch(0.15 0.010 240)",
          colorText:            "oklch(0.93 0.005 240)",
          colorTextSecondary:   "oklch(0.56 0.012 240)",
          colorInputBackground: "oklch(0.20 0.010 240)",
          colorInputText:       "oklch(0.93 0.005 240)",
          colorDanger:          "oklch(0.58 0.22 25)",
          borderRadius:         "0.45rem",
          fontFamily:           "var(--font-inter), sans-serif",
          fontSize:             "14px",
        },
        elements: {
          // Strip Clerk's outer card chrome — our layout handles the container
          rootBox:  "w-full",
          card:     "bg-transparent shadow-none border-none p-0 gap-6",
          // Let Clerk render normally inside — just remove the white box
        },
      }}
    />
  );
}