// ─── Document enums ───────────────────────────────────────────────────────────

export enum DocumentStatus {
  PENDING    = "PENDING",
  APPROVED   = "APPROVED",
  REJECTED   = "REJECTED",
  EXPIRED    = "EXPIRED",
  SUPERSEDED = "SUPERSEDED",
  WITHDRAWN  = "WITHDRAWN",
}

export enum DocumentScope {
  VENDOR = "VENDOR",
  OUTLET = "OUTLET",
}

export enum DocumentTypeStatus {
  ACTIVE     = "ACTIVE",
  INACTIVE   = "INACTIVE",
  DEPRECATED = "DEPRECATED",
  ARCHIVED   = "ARCHIVED",
}