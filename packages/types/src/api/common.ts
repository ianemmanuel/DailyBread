// ─── API response envelope ────────────────────────────────────────────────────
// Every API response follows one of these three shapes.
// The backend constructs them. The frontend destructures them.
// Consistency here means one fetch wrapper handles all responses.

export interface ApiSuccess<T> {
  status : "success"
  data   : T
}

export interface ApiError {
  status  : "error"
  message : string
  code    : string
}

// The union type for any API response — use this when the outcome is unknown
export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page       : number
  pageSize   : number
  total      : number
  totalPages : number
}

export interface PaginatedData<T> {
  items      : T[]
  pagination : PaginationMeta
}

export type PaginatedResponse<T> = ApiSuccess<PaginatedData<T>>

// ─── Common query params ──────────────────────────────────────────────────────

export interface PaginationParams {
  page?     : number   // default 1
  pageSize? : number   // default 20, max 100
}

export interface DateRangeParams {
  from? : string  // ISO date string
  to?   : string  // ISO date string
}

// ─── Type guard ───────────────────────────────────────────────────────────────
// Use this in frontend fetch wrappers to narrow the response type.

export function isApiError(response: ApiResponse<unknown>): response is ApiError {
  return response.status === "error"
}