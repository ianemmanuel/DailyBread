import Link from "next/link"
import { Button } from "@repo/ui/components/button"

export default function NotFound() {
  return (
    <div className="page-content text-center space-y-4">
      <h1 className="text-xl font-semibold">User not found</h1>
      <p className="text-sm text-muted-foreground">
        The user you’re looking for does not exist or may have been removed.
      </p>
      <Button asChild>
        <Link href="/identity">Back to users</Link>
      </Button>
    </div>
  )
}