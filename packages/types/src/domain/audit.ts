export interface AuditLogInput {
  adminUserId : string
  action      : string
  entityType  : string
  entityId    : string | null
  changes?    : {
    before?: Record<string, unknown>
    after?  : Record<string, unknown>
  }
  metadata?   : Record<string, unknown>
}