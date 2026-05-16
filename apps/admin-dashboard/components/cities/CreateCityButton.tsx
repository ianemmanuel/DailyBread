
"use client"

import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@repo/ui/components/button"

export function CreateCityButton() {
  const router = useRouter()

  return (
    <Button 
      size="sm" 
      className="gap-2"
      onClick={() => router.push("/cities/create")}
    >
      <Plus className="h-4 w-4" />
      Add City
    </Button>
  )
}