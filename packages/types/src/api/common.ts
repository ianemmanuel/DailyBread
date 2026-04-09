// ─── API response envelope ────────────────────────────────────────────────────
// Every API response follows one of these three shapes.
// The backend constructs them via sendSuccess/sendError.
// The frontend destructures them in fetch wrappers.

export interface ApiSuccess<T> {
  status  : "success"
  message?: string
  data    : T
}

export interface ApiErrorResponse {
  status  : "error"
  message : string
  code    : string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorResponse

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

export function isApiError(response: ApiResponse<unknown>): response is ApiErrorResponse {
  return response.status === "error"
}