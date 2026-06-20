interface Props {
  label: string
  value: string | number
  icon?: React.ElementType
  sub?: string
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  sub,
}: Props) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        backgroundColor: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p
            className="text-xs"
            style={{
              color: "var(--muted-foreground)",
            }}
          >
            {label}
          </p>

          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {value}
          </p>

          {sub && (
            <p
              className="mt-1 text-xs"
              style={{
                color: "var(--muted-foreground)",
              }}
            >
              {sub}
            </p>
          )}
        </div>

        {Icon && (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{
              backgroundColor: "var(--icon-bg)",
            }}
          >
            <Icon
              className="h-4 w-4"
              style={{
                color: "var(--icon-fg)",
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}