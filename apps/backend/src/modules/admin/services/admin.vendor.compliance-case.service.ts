import { prisma, AdminUserStatus, AdminReviewAvailability, AdminScopeType, type DocumentComplianceSeverity } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { AdminPermissions, type AdminPermissionKey } from "@repo/types/enums"
import { ApiError } from "@/errors/ApiError"
import { auditService } from "@/services/audit"
import { getVendorComplianceIssues, type ComplianceIssueKind } from "./admin.vendor.compliance.service"
import { effectivelyHoldsWhere } from "@/lib/permissions/effective"

/*
 * Claim/reassign/escalate workflow for compliance cases — deliberately
 * modeled as close as possible to VendorApplication's review workflow
 * (claimApplication/reassignApplication/escalateApplication in
 * admin.vendor.service.ts) so the two feel like siblings. Two deliberate
 * deviations, both from a 2026-08-26 refinement pass (see CLAUDE.md):
 *
 *  1. Claiming from the escalation pool requires the claimant be
 *     country-scoped to the vendor's own country — a globally-scoped
 *     holder of VENDORS_COMPLIANCE_RECEIVE_ESCALATION still cannot claim
 *     (see claimComplianceCase). Compliance follow-up stays with the
 *     local country team; the applications escalation pool has no such
 *     restriction.
 *  2. Manage actions (waive/notify/revoke, and reviewing a remediation
 *     document) require the actor to ALREADY be the claimed owner —
 *     unlike claim/escalate, there's no "unclaimed = anyone may act"
 *     fallback for these (see assertClaimedByActor). And once a case is
 *     claimed specifically out of the open escalation pool
 *     (claimedFromEscalation), that admin is the terminal resolver — they
 *     can no longer escalate it further, only reassignment (a
 *     supervisory override) can move it off their plate. A normal
 *     reassignment resets this, since reassignment is a deliberate
 *     hand-off, not the receiving admin opting into being the end of the
 *     line.
 */

function assertVendorInScope(countryId: string, scope: AdminScopeContext): void {
  if (!scope.isGlobal && !scope.countryIds.includes(countryId)) {
    throw new ApiError(403, "This vendor is outside your scope", "SCOPE_FORBIDDEN")
  }
}

async function resolveVendorAndDocType(vendorId: string, documentTypeId: string, scope: AdminScopeContext) {
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { id: true, countryId: true, deletedAt: true },
  })
  if (!vendor || vendor.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  assertVendorInScope(vendor.countryId, scope)

  const documentType = await prisma.documentTypeConfig.findUnique({
    where : { id: documentTypeId },
    select: { id: true, countryId: true, complianceSeverity: true },
  })
  if (!documentType || documentType.countryId !== vendor.countryId) {
    throw new ApiError(400, "Document type does not apply to this vendor", "DOCUMENT_TYPE_MISMATCH")
  }
  return { vendor, documentType }
}

//* Same shape as assertReviewerOwnership (admin.vendor.service.ts) —
//* permanent lock-out for the escalating admin, receiver-only gate for the
//* open escalation pool, "assigned to someone else" otherwise.
function assertCaseOwnership(
  complianceCase: { assignedReviewerId: string | null; escalatedByAdminId: string | null },
  actorId: string,
  actorPermissions: AdminPermissionKey[],
): void {
  if (complianceCase.escalatedByAdminId === actorId) {
    throw new ApiError(403, "You escalated this case and can no longer act on it", "ESCALATED_BY_YOU")
  }
  if (!complianceCase.assignedReviewerId) {
    if (complianceCase.escalatedByAdminId && !actorPermissions.includes(AdminPermissions.VENDORS_COMPLIANCE_RECEIVE_ESCALATION)) {
      throw new ApiError(403, "This case was escalated and is only actionable by admins who receive escalations", "ESCALATION_RECEIVER_ONLY")
    }
    return
  }
  if (complianceCase.assignedReviewerId === actorId) return
  throw new ApiError(403, "This case is assigned to another admin", "NOT_ASSIGNED_REVIEWER")
}

//* Claim/escalate can be the FIRST time a case exists for a fresh issue —
//* they don't depend on the reconciliation job having already created one.
async function getOrCreateActiveCase(
  vendorId: string, documentTypeId: string, issueType: ComplianceIssueKind, severity: DocumentComplianceSeverity,
) {
  const existing = await prisma.vendorComplianceCase.findFirst({
    where: { vendorId, documentTypeId, issueType, status: { in: ["OPEN", "CLAIMED", "ESCALATED"] } },
  })
  if (existing) return existing
  return prisma.vendorComplianceCase.create({
    data: { vendorId, documentTypeId, issueType, severity, status: "OPEN" },
  })
}

export async function claimComplianceCase(
  vendorId        : string,
  documentTypeId  : string,
  issueType       : ComplianceIssueKind,
  actorId         : string,
  actorScope      : AdminScopeContext,
  actorPermissions: AdminPermissionKey[],
) {
  const { vendor, documentType } = await resolveVendorAndDocType(vendorId, documentTypeId, actorScope)
  const kase = await getOrCreateActiveCase(vendorId, documentTypeId, issueType, documentType.complianceSeverity)

  if (kase.status === "RESOLVED" || kase.status === "WAIVED") {
    throw new ApiError(400, `This issue is already ${kase.status.toLowerCase()}`, "INVALID_STATUS")
  }
  if (kase.assignedReviewerId) {
    throw new ApiError(409, "Case is already claimed", "ALREADY_CLAIMED")
  }
  // Unclaimed: either a fresh OPEN case (anyone holding CLAIM may take it)
  // or an open escalation-pool case (RECEIVE_ESCALATION holders only,
  // and never the admin who escalated it) — assertCaseOwnership enforces both.
  assertCaseOwnership(kase, actorId, actorPermissions)

  // Escalation-pool claims stay within the vendor's own country team —
  // see VENDORS_COMPLIANCE_RECEIVE_ESCALATION's doc comment in packages/types.
  if (kase.escalatedByAdminId && (actorScope.isGlobal || !actorScope.countryIds.includes(vendor.countryId))) {
    throw new ApiError(403, "Escalated compliance cases can only be claimed by country-scoped admins for that country", "GLOBAL_CANNOT_CLAIM_ESCALATION")
  }

  // If escalatedByAdminId is set here, this can only be an open-escalation-
  // pool claim (an assigned reviewer alongside a set escalatedByAdminId
  // never occurs — escalating always clears assignedReviewerId first) —
  // so this is exactly the "claiming out of the pool" case, and the admin
  // who does so becomes the terminal resolver (see assertClaimedByActor's
  // doc comment and escalateComplianceCase below).
  const claimedFromEscalation = !!kase.escalatedByAdminId

  const assignedAt = new Date()
  const result = await prisma.vendorComplianceCase.updateMany({
    where: { id: kase.id, assignedReviewerId: null },
    data : { assignedReviewerId: actorId, assignedAt, status: "CLAIMED", claimedFromEscalation },
  })
  if (result.count === 0) throw new ApiError(409, "Case was claimed by another admin just now", "ALREADY_CLAIMED")

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_compliance_case.claimed",
    entityType : "VendorComplianceCase",
    entityId   : kase.id,
    changes    : { after: { assignedReviewerId: actorId, claimedFromEscalation } },
    metadata   : { vendorId, documentTypeId, issueType },
  })

  return { id: kase.id, assignedReviewerId: actorId, assignedAt }
}

/*
 * Gate for manage actions (waive, notify, revoke a waiver, review a
 * remediation document) — deliberately stricter than assertCaseOwnership:
 * no "unclaimed = anyone may act" fallback. The actor must already be the
 * claimed owner. Looked up by vendorId+documentTypeId only (not
 * issueType) since only one issue kind is ever live for a given
 * vendor+documentType at a time, and this needs to find the case
 * regardless of its current status (including WAIVED, e.g. when revoking
 * a waiver) — so "most recent non-RESOLVED case" is the right target,
 * not the OPEN/CLAIMED/ESCALATED-only filter getOrCreateActiveCase uses.
 */
export async function assertClaimedByActor(vendorId: string, documentTypeId: string, actorId: string): Promise<void> {
  const kase = await prisma.vendorComplianceCase.findFirst({
    where  : { vendorId, documentTypeId, status: { not: "RESOLVED" } },
    orderBy: { createdAt: "desc" },
  })
  if (!kase || kase.assignedReviewerId !== actorId) {
    throw new ApiError(403, "Claim this compliance issue before you can act on it", "NOT_CLAIMED")
  }
}

/*
 * Gate for reviewing a vendor-account VendorDocument (approveDocument/
 * rejectDocument in admin.vendor.service.ts) — deliberately softer than
 * assertClaimedByActor: a no-op when no compliance case currently exists
 * for this vendor+documentType at all, since a document can in principle
 * exist for reasons unrelated to compliance remediation (there is no such
 * flow yet, but this shouldn't wrongly block review the day one exists).
 * Only when a case IS active does ownership become mandatory.
 */
export async function assertVendorDocumentReviewableByActor(vendorId: string, documentTypeId: string, actorId: string): Promise<void> {
  const kase = await prisma.vendorComplianceCase.findFirst({
    where  : { vendorId, documentTypeId, status: { not: "RESOLVED" } },
    orderBy: { createdAt: "desc" },
  })
  if (!kase) return
  if (kase.assignedReviewerId !== actorId) {
    throw new ApiError(403, "Claim this compliance issue before reviewing its document", "NOT_CLAIMED")
  }
}

/*
 * Guards against escalating a compliance case into a pool nobody in this
 * vendor's country can ever pick up — see claimComplianceCase's country-
 * only claim restriction above. Mirrors assertEscalationReceiverExists in
 * admin.vendor.service.ts.
 */
async function assertEscalationReceiverExists(countryId: string): Promise<void> {
  const receiver = await prisma.adminUser.findFirst({
    where: {
      status            : AdminUserStatus.active,
      reviewAvailability: AdminReviewAvailability.AVAILABLE,
      ...effectivelyHoldsWhere(AdminPermissions.VENDORS_COMPLIANCE_RECEIVE_ESCALATION),
      scopes: {
        some: {
          OR: [
            { scopeType: AdminScopeType.COUNTRY, countryId },
            { scopeType: AdminScopeType.CITY, countryId },
          ],
        },
      },
    },
    select: { id: true },
  })
  if (!receiver) {
    throw new ApiError(
      400,
      "No admin can currently receive escalations for this country — reassign this case directly to a specific admin instead, or ask a supervisor to grant the receive-escalation permission to someone in this country.",
      "NO_ESCALATION_RECEIVER",
    )
  }
}

/*
 * Escalate now requires the actor already be the claimed owner — no more
 * "unclaimed, non-escalated case → anyone with ESCALATE may act" shortcut
 * (that used to be assertCaseOwnership's behavior, same as claim). This
 * forces at least a claim-and-look before a case moves up, matching the
 * stricter no-fallback rule assertClaimedByActor already applies to
 * waive/notify/revoke and document review.
 */
function assertClaimedForEscalate(
  complianceCase: { assignedReviewerId: string | null; escalatedByAdminId: string | null },
  actorId: string,
): void {
  if (complianceCase.escalatedByAdminId === actorId) {
    throw new ApiError(403, "You escalated this case and can no longer act on it", "ESCALATED_BY_YOU")
  }
  if (complianceCase.assignedReviewerId !== actorId) {
    throw new ApiError(403, "Claim this compliance issue before you can escalate it", "NOT_CLAIMED")
  }
}

export async function escalateComplianceCase(
  vendorId        : string,
  documentTypeId  : string,
  issueType       : ComplianceIssueKind,
  reason          : string,
  actorId         : string,
  actorScope      : AdminScopeContext,
  actorPermissions: AdminPermissionKey[],
) {
  if (!reason?.trim()) throw new ApiError(400, "reason is required", "MISSING_FIELDS")

  const { vendor, documentType } = await resolveVendorAndDocType(vendorId, documentTypeId, actorScope)
  const kase = await getOrCreateActiveCase(vendorId, documentTypeId, issueType, documentType.complianceSeverity)

  if (kase.status === "RESOLVED" || kase.status === "WAIVED") {
    throw new ApiError(400, `This issue is already ${kase.status.toLowerCase()}`, "INVALID_STATUS")
  }
  // Terminal rule: an admin who claimed this case directly out of the
  // escalation pool is the designated end of the line — they resolve it
  // themselves, they don't pass it up again. escalatedByAdminId itself is
  // NOT the gate here (it's a permanent historical marker, always
  // overwritten below to whoever escalates now) — a case that was once
  // escalated but has since been reassigned to a fresh admin can still be
  // escalated again; only claimedFromEscalation blocks it.
  if (kase.claimedFromEscalation) {
    throw new ApiError(403, "This case reached you via escalation — it must be resolved directly, not escalated again", "TERMINAL_ESCALATION")
  }
  // Claim-first — see assertClaimedForEscalate's doc comment.
  assertClaimedForEscalate(kase, actorId)
  // No explicit-target escalate exists for compliance (unlike
  // applications) — every escalate drops into the open pool, so always
  // confirm someone in this country can actually pick it up.
  await assertEscalationReceiverExists(vendor.countryId)

  const escalatedAt = new Date()
  const previousReviewerId = kase.assignedReviewerId

  const updated = await prisma.vendorComplianceCase.update({
    where: { id: kase.id },
    data : {
      assignedReviewerId: null,
      status            : "ESCALATED",
      escalatedByAdminId: actorId,
      escalatedAt,
      escalationReason  : reason.trim(),
      claimedFromEscalation: false,
    },
  })

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_compliance_case.escalated",
    entityType : "VendorComplianceCase",
    entityId   : kase.id,
    changes    : { before: { assignedReviewerId: previousReviewerId }, after: { escalatedByAdminId: actorId, reason: reason.trim() } },
    metadata   : { vendorId, documentTypeId, issueType },
  })

  return updated
}

//* Same shape as assertEligibleReviewTarget (admin.vendor.service.ts) —
//* target must be an active, available admin holding the required
//* capability within the vendor's country.
async function assertEligibleComplianceTarget(
  targetAdminId    : string,
  countryId        : string,
  requireCapability: AdminPermissionKey,
): Promise<void> {
  const target = await prisma.adminUser.findUnique({
    where : { id: targetAdminId },
    select: { id: true, status: true, reviewAvailability: true },
  })
  if (!target) throw new ApiError(404, "Target admin not found", "TARGET_NOT_FOUND")
  if (target.status !== AdminUserStatus.active) throw new ApiError(400, "Target admin is not an active admin", "TARGET_INACTIVE")
  if (target.reviewAvailability !== AdminReviewAvailability.AVAILABLE) throw new ApiError(400, "Target admin is unavailable", "TARGET_UNAVAILABLE")

  const hasCapability = await prisma.adminUser.findFirst({
    // EFFECTIVE capability (grant ∩ current pool ∩ active ∩ valid scope), not a raw grant row
    where : { AND: [{ id: targetAdminId }, effectivelyHoldsWhere(requireCapability)] },
    select: { id: true },
  })
  if (!hasCapability) throw new ApiError(400, "Target admin does not have the required capability", "TARGET_NOT_CAPABLE")

  const targetHasScope = await prisma.adminUserScope.findFirst({
    where: {
      adminUserId: targetAdminId,
      OR: [
        { scopeType: AdminScopeType.GLOBAL },
        { scopeType: AdminScopeType.COUNTRY, countryId },
        { scopeType: AdminScopeType.CITY, countryId },
      ],
    },
  })
  if (!targetHasScope) throw new ApiError(400, "Target admin does not have scope over this vendor's country", "TARGET_OUT_OF_SCOPE")
}

//* List admins eligible to receive a compliance case via reassign —
//* powers the target picker. Deliberately does not exclude the actor
//* (a REASSIGN holder looking at a case someone else claimed can hand it
//* to themselves), matching listEligibleReviewTargets' reasoning.
export async function listEligibleComplianceTargets(
  vendorId  : string,
  actorScope: AdminScopeContext,
  capability: AdminPermissionKey = AdminPermissions.VENDORS_COMPLIANCE_CLAIM,
) {
  const vendor = await prisma.vendorAccount.findUnique({ where: { id: vendorId }, select: { countryId: true, deletedAt: true } })
  if (!vendor || vendor.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  assertVendorInScope(vendor.countryId, actorScope)

  return prisma.adminUser.findMany({
    where: {
      status            : AdminUserStatus.active,
      reviewAvailability: AdminReviewAvailability.AVAILABLE,
      ...effectivelyHoldsWhere(capability),
      scopes: {
        some: {
          OR: [
            { scopeType: AdminScopeType.GLOBAL },
            { scopeType: AdminScopeType.COUNTRY, countryId: vendor.countryId },
            { scopeType: AdminScopeType.CITY, countryId: vendor.countryId },
          ],
        },
      },
    },
    select : { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })
}

/*
 * Reassign — a supervisory hand-off via VENDORS_COMPLIANCE_REASSIGN.
 * Deliberately does NOT call assertCaseOwnership: like reassignApplication,
 * REASSIGN is an override permission, not an ownership action — the actor
 * doesn't need to currently hold the case. The target is immediately and
 * fully the new owner (status CLAIMED, claimedFromEscalation reset to
 * false) — no separate "accept" step, matching this codebase's existing
 * reassignApplication behavior and the standard enterprise case-management
 * pattern (a lead reassigns, the new owner is responsible from that
 * moment). Resetting claimedFromEscalation is what lets a reassigned
 * admin escalate again even if the case was previously escalated or is
 * being reassigned out of the open escalation pool — see the file-level
 * comment above.
 */
export async function reassignComplianceCase(
  vendorId        : string,
  documentTypeId  : string,
  issueType       : ComplianceIssueKind,
  targetAdminId   : string,
  reason          : string | undefined,
  actorId         : string,
  actorScope      : AdminScopeContext,
) {
  const { vendor, documentType } = await resolveVendorAndDocType(vendorId, documentTypeId, actorScope)
  const kase = await getOrCreateActiveCase(vendorId, documentTypeId, issueType, documentType.complianceSeverity)

  if (kase.status === "RESOLVED" || kase.status === "WAIVED") {
    throw new ApiError(400, `This issue is already ${kase.status.toLowerCase()}`, "INVALID_STATUS")
  }
  if (targetAdminId === kase.assignedReviewerId) throw new ApiError(400, "Case is already assigned to this admin", "NO_CHANGE")
  if (targetAdminId === kase.escalatedByAdminId) throw new ApiError(400, "Cannot reassign to the admin who escalated this case", "TARGET_IS_ESCALATOR")

  // Reassigning out of the open escalation pool narrows the eligible
  // target pool to RECEIVE_ESCALATION holders only — same reasoning as
  // reassignApplication: otherwise a REASSIGN holder could route it
  // straight back to an ordinary claimant and defeat the point of
  // escalating it in the first place.
  const isOpenEscalationPool = !kase.assignedReviewerId && !!kase.escalatedByAdminId
  await assertEligibleComplianceTarget(
    targetAdminId, vendor.countryId,
    isOpenEscalationPool ? AdminPermissions.VENDORS_COMPLIANCE_RECEIVE_ESCALATION : AdminPermissions.VENDORS_COMPLIANCE_CLAIM,
  )

  const previousReviewerId = kase.assignedReviewerId
  const assignedAt = new Date()

  const updated = await prisma.vendorComplianceCase.update({
    where: { id: kase.id },
    data : { assignedReviewerId: targetAdminId, assignedAt, status: "CLAIMED", claimedFromEscalation: false },
  })

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_compliance_case.reassigned",
    entityType : "VendorComplianceCase",
    entityId   : kase.id,
    changes    : { before: { assignedReviewerId: previousReviewerId }, after: { assignedReviewerId: targetAdminId } },
    metadata   : { vendorId, documentTypeId, issueType, previousReviewerId, newReviewerId: targetAdminId, reason },
  })

  return updated
}

/*
 * "Claim all" — the single-point-of-contact convenience the vendor
 * compliance detail page offers (see CLAUDE.md's compliance-ownership
 * decision): loops every currently-claimable issue for one vendor through
 * the exact same claimComplianceCase used for a per-issue claim, so every
 * rule that applies to an individual claim (country-scope-only for
 * escalation-pool issues, already-claimed conflicts, etc.) applies here
 * too — this is a bulk convenience wrapper, not a separate code path.
 * Already-mine issues are silently skipped (nothing to do); issues
 * claimed by someone else, or that fail claimComplianceCase for any
 * reason, are reported back rather than silently dropped.
 */
export async function claimAllComplianceIssuesForVendor(
  vendorId        : string,
  actorId         : string,
  actorScope      : AdminScopeContext,
  actorPermissions: AdminPermissionKey[],
): Promise<{ claimed: string[]; alreadyMine: string[]; skipped: { documentTypeId: string; documentTypeName: string; reason: string }[] }> {
  const issues = await getVendorComplianceIssues(vendorId, actorScope) // already scope-checks vendorId

  const claimed: string[] = []
  const alreadyMine: string[] = []
  const skipped: { documentTypeId: string; documentTypeName: string; reason: string }[] = []

  for (const issue of issues) {
    if (issue.issueStatus === "WAIVED") continue // nothing to claim
    if (issue.case?.assignedReviewerId === actorId) { alreadyMine.push(issue.documentType.id); continue }
    if (issue.case?.assignedReviewerId) {
      skipped.push({ documentTypeId: issue.documentType.id, documentTypeName: issue.documentType.name, reason: `Claimed by ${issue.case.assignedReviewerName ?? "another admin"}` })
      continue
    }
    try {
      await claimComplianceCase(vendorId, issue.documentType.id, issue.caseKind, actorId, actorScope, actorPermissions)
      claimed.push(issue.documentType.id)
    } catch (err) {
      skipped.push({ documentTypeId: issue.documentType.id, documentTypeName: issue.documentType.name, reason: err instanceof ApiError ? err.message : "Failed to claim" })
    }
  }

  return { claimed, alreadyMine, skipped }
}
