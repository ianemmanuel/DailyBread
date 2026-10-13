import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import { handleListAuditLogs, handleGetAuditLog, handleExportAuditLogsCsv } from "../../controllers/admin.audit.controller"

/**
 * Identity & Access audit trail — read-only. Mounted at: /api/admin/v1/audit
 *
 * requirePermission checks the grant; the service (admin.audit.service.ts)
 * scopes rows to admins inside the actor's scope through the same rule as the
 * admin-user reads (getManageableAdminUserIds → adminsInScopeWhere). No
 * role-name guard.
 */
const router: Router = Router()

const READ = requirePermission(AdminPermissions.AUDIT_LOGS_ALL_READ)

router.get("/",       READ, handleListAuditLogs)
// Roadmap VM-P2-01 (CLAUDE.md) — must come before "/:id" so "export" isn't
// swallowed as an id param.
router.get("/export", READ, handleExportAuditLogsCsv)
router.get("/:id",    READ, handleGetAuditLog)

export default router
