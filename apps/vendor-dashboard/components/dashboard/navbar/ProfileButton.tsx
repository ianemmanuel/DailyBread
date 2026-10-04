'use client'

import { UserButton } from '@clerk/nextjs'
import { ListOrdered } from 'lucide-react'

/*
 * Clerk's own account menu, unchanged, plus a shortcut to Orders. The
 * shortcut is a `UserButton.Link`, which navigates; it used to push
 * `/dashboard/orders`, a route that does not exist (Orders is `/orders`).
 */
export default function ProfileButton() {
  return (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Link
          label="My orders"
          labelIcon={<ListOrdered className="h-4 w-4" />}
          href="/orders"
        />
      </UserButton.MenuItems>
    </UserButton>
  )
}
