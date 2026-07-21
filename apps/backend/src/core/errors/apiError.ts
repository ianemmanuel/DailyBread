
export interface ApiErrorDetail {
    field?: string
    message: string
}

/**
 * isOperational defaults to true because almost every ApiError you
 * throw by hand IS an expected, known failure. The
 * only place that constructs one with isOperational: false is the
 * error middleware itself, for a failure it couldn't otherwise
 * classify at all.
 */
export class ApiError extends Error {
  statusCode   : number
  code         : string
  errors?      : ApiErrorDetail[]
  isOperational: boolean

  constructor(
    statusCode: number,
    message: string,
    code = "API_ERROR",
    errors?: ApiErrorDetail[],
    isOperational = true,
  ) {
    super(message)
    this.statusCode    = statusCode
    this.code          = code
    this.errors        = errors
    this.isOperational = isOperational
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}