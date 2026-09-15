"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  documentTypeId: string
  countryId     : string
}

export function DocumentActivateButton({ documentTypeId, countryId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function activate() {
    setLoading(true)
    try {
      const res = await fetch(`/api/document-types/${documentTypeId}/activate?countryRef=${countryId}`, {
        method: "PATCH",
      })
      const data = await res.json()
      if (res.ok) {
        toast.success("Document activated")
        router.refresh()
      } else {
        toast.error("Activation failed", { description: data.message ?? "Something went wrong." })
      }
    } catch {
      toast.error("Network error", { description: "Please try again." })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" disabled={loading} onClick={activate}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
      Activate
    </Button>
  )
}
