export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,

  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,

  INTERNAL_SERVER_ERROR: 500,
  //* Used for "this will work, just not yet" — e.g. a verified customer whose
  //* signup webhook has not landed. Distinct from 401 on purpose: the client
  //* should retry, not send the user back to sign in.
  SERVICE_UNAVAILABLE: 503,
} as const

export type HttpStatus = (typeof HttpStatus)[keyof typeof HttpStatus]