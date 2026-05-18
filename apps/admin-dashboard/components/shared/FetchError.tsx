import { AlertTriangle } from "lucide-react"

interface FetchErrorProps {
  message:  string
  context?: string
}

export function FetchError({ message, context }: FetchErrorProps) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border px-5 py-4"
      style={{
        backgroundColor: "var(--destructive-bg)",
        borderColor:     "color-mix(in oklch, var(--destructive) 25%, var(--border))",
      }}
    >
      <div
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: "color-mix(in oklch, var(--destructive) 15%, transparent)" }}
      >
        <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--destructive)" }} />
      </div>
      <div>
        <p className="text-xs font-semibold" style={{ color: "var(--destructive)" }}>
          {context ? `Unable to load ${context}` : "Something went wrong"}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
          {message}
        </p>
      </div>
    </div>
  )
}