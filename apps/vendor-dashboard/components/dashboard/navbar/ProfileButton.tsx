'use client'

import { UserButton } from '@clerk/nextjs'
import { ListOrdered } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function ProfileButton() {
  const router = useRouter()

  return (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Action
          label="My orders"
          labelIcon={<ListOrdered className="h-4 w-4" />}
          onClick={() => router.push('/dashboard/orders')}
        />
      </UserButton.MenuItems>
    </UserButton>
  )
}