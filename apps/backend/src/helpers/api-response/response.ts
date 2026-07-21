import { Response } from "express"
import type { ApiErrorDetail } from "@/core/errors/apiError"

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = 200
) => {
  return res.status(statusCode).json({
    status: "success",
    message: message || undefined,
    data,
  })
}

export const sendError = (
  res: Response,
  statusCode: number,
  message: string,
  code?: string,
  errors?: ApiErrorDetail[],
) => {
  return res.status(statusCode).json({
    status: "error",
    message,
    ...(code && { code }),
    ...(errors && errors.length > 0 && { errors }),
  })
}