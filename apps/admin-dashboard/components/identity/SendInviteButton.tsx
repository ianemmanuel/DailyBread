"use client"

import { useTransition } from "react"
import { useRouter }     from "next/navigation"
import { toast }         from "sonner"
import { Mail }          from "lucide-react"
import { Button }        from "@repo/ui/components/button"

interface Props {
  userId    : string
  userStatus: string
  roleName  : string
}

export function SendInviteButton({ userId, userStatus, roleName }: Props) {
  const router                       = useRouter()
  const [isPending, startTransition] = useTransition()

  async function sendInvite() {
    startTransition(async () => {
      const res = await fetch(`/api/identity/users/${userId}/invite`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (res.ok) {
        toast.success(
          userStatus === "invited" ? "Invitation resent" : "Invitation sent",
          {
            description: roleName
              ? `The user will receive an email to join as ${roleName}.`
              : "The user will receive an invitation email.",
          },
        )
        router.refresh()
      } else {
        const data = await res.json()
        toast.error("Failed to send invitation", {
          description: data.message ?? "Please try again.",
        })
      }
    })
  }

  return (
    <Button size="sm" variant="outline" disabled={isPending} onClick={sendInvite}>
      <Mail className="mr-2 h-4 w-4" />
      {isPending
        ? "Sending…"
        : userStatus === "invited" ? "Resend Invitation" : "Send Invitation"
      }
    </Button>
  )
}