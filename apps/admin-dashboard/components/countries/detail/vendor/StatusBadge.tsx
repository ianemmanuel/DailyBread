interface Props {
  status:
    | "DRAFT"
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "ACTIVE"
    | "SUSPENDED"
    | "BANNED"
}

export function StatusBadge({ status }: Props) {
  const styles = {
    DRAFT: {
      bg: "var(--muted)",
      fg: "var(--muted-foreground)",
      label: "Draft",
    },

    SUBMITTED: {
      bg: "color-mix(in oklch, var(--primary) 12%, transparent)",
      fg: "var(--primary)",
      label: "Submitted",
    },

    UNDER_REVIEW: {
      bg: "var(--warning-bg)",
      fg: "var(--warning)",
      label: "Under Review",
    },

    APPROVED: {
      bg: "var(--success-bg)",
      fg: "var(--success)",
      label: "Approved",
    },

    REJECTED: {
      bg: "var(--destructive-bg)",
      fg: "var(--destructive)",
      label: "Rejected",
    },

    ACTIVE: {
      bg: "var(--success-bg)",
      fg: "var(--success)",
      label: "Active",
    },

    SUSPENDED: {
      bg: "var(--warning-bg)",
      fg: "var(--warning)",
      label: "Suspended",
    },

    BANNED: {
      bg: "var(--destructive-bg)",
      fg: "var(--destructive)",
      label: "Banned",
    },
  }

  const config = styles[status]

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        backgroundColor: config.bg,
        color: config.fg,
      }}
    >
      {config.label}
    </span>
  )
}