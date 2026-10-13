import type { ComplianceIssueItem } from "@/types"

/** Shared status badge — same rendering on /vendors/compliance and the vendor detail page's Compliance section. */
export function ComplianceIssueBadge({ issue }: { issue: ComplianceIssueItem }) {
  if (issue.issueStatus === "WAIVED") return <span className="badge-success">Waived</span>
  if (issue.issueStatus === "MISSING") return <span className="badge-danger">Missing</span>
  if (issue.issueStatus === "EXPIRING_SOON") return <span className="badge-warning">Expiring soon</span>
  return issue.inGracePeriod
    ? <span className="badge-warning">Expired (grace period)</span>
    : <span className="badge-danger">Expired</span>
}
