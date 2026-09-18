"use client"

import * as React from "react"

/*
 * WHY THIS EXISTS INSTEAD OF next-themes
 *
 * next-themes renders its blocking <script> INSIDE the React tree, from a
 * Client Component. React 19 / Next 16 warns on exactly that — "Encountered a
 * script tag while rendering React component" — and 0.4.6 (the latest release)
 * has no prop to turn it off, so the warning is structural rather than
 * something we configured wrong.
 *
 * The fix is to move the script where it belongs: <ThemeScript /> is rendered
 * by the SERVER layout, so it lands in the HTML, runs before first paint, and
 * is never re-rendered on the client. What remains here is the small amount of
 * state that has to live in React.
 *
 * The shadcn docs recommend next-themes and that is still good advice for most
 * apps — it is only the script placement that does not survive Next 16.
 */

export type Theme = "light" | "dark" | "system"

const STORAGE_KEY = "dailybread-theme"
const DARK_QUERY = "(prefers-color-scheme: dark)"

/* Must stay in step with the effect below: this runs before React, the effect
 * runs after, and if the two disagree the page paints one theme then flips.
 * try/catch because localStorage throws outright in some privacy modes, and a
 * theme preference is never worth breaking the page over. */
const SCRIPT = `try{var t=localStorage.getItem("${STORAGE_KEY}"),d=t==="dark"||(t!=="light"&&matchMedia("${DARK_QUERY}").matches),e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(e){}`

/**
 * The pre-paint theme script. Render from the SERVER layout as the first child
 * of <body>: that is what puts the `dark` class on <html> before any content
 * paints, and what keeps the script out of the client render.
 */
export function ThemeScript() {
  return <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: SCRIPT }} />
}

const ThemeContext = React.createContext<{
  /** What the visitor chose, "system" included. */
  theme: Theme
  setTheme: (theme: Theme) => void
  /** What is actually painted. `undefined` until mounted. */
  resolvedTheme: "light" | "dark" | undefined
} | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  /*
   * The initializer runs on the server too, where there is no localStorage, so
   * it returns "system" there and the stored value on the client. Those differ
   * by design, and that is safe ONLY because nothing in the initial HTML
   * depends on it. `resolvedTheme` starts undefined on both sides for the same
   * reason, and consumers treat that as "not known yet" rather than "light".
   */
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === "undefined") return "system"
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === "light" || stored === "dark") return stored
    } catch {}
    return "system"
  })
  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">()

  React.useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)

    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches)
      document.documentElement.classList.toggle("dark", dark)
      /* Themes the browser's own widgets — scrollbars, form controls, the
         caret. Without it a dark page keeps white scrollbars. */
      document.documentElement.style.colorScheme = dark ? "dark" : "light"
      setResolvedTheme(dark ? "dark" : "light")
    }

    apply()

    /* Only follow the OS while the visitor is actually on "system" — listening
       unconditionally would repaint under someone who chose a fixed theme. */
    if (theme !== "system") return
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [theme])

  const setTheme = React.useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {}
    setThemeState(next)
  }, [])

  const value = React.useMemo(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = React.useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>")
  return context
}
