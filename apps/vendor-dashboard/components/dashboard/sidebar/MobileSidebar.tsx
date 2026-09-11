'use client'

import dynamic from 'next/dynamic'
import { Menu } from 'lucide-react'
import { Button } from '@repo/ui/components/button'

/*
 * The burger renders immediately; the Radix Sheet behind it mounts after
 * hydration.
 *
 * Why: Radix's Dialog derives `aria-controls` from React's useId, and useId is
 * a function of the component's position in the render tree. The server render
 * of this app puts one extra multi-child level in this component's ancestor
 * path than the client render does (framework/provider wrappers above the
 * dashboard layout, not app code — confirmed by decoding the two ids: they
 * share their shallow tail and differ by exactly one level near the leaf).
 * That makes the id differ, and the trigger's aria-controls mismatch on every
 * page load.
 *
 * Rather than chase a wrapper we don't own, this stops depending on the two
 * renders agreeing: the sheet's server HTML was never useful anyway. It's
 * hidden above lg, and a navigation drawer can't open before its JavaScript
 * has loaded, so nothing is lost by mounting it on the client.
 *
 * The placeholder is a real button of the same size and appearance, so there
 * is no pop-in and no layout shift — only the drawer behind it arrives late,
 * and it could not have opened any earlier regardless.
 */
const MobileSidebarSheet = dynamic(
  () => import('./MobileSidebarSheet').then((m) => m.MobileSidebarSheet),
  {
    ssr: false,
    loading: () => (
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-xl text-muted-foreground lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </Button>
    ),
  },
)

export function MobileSidebar() {
  return <MobileSidebarSheet />
}
