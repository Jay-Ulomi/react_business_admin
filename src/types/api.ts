export type ApiEnvelope<T> = {
  success: boolean
  message?: string
  data: T
  errors?: unknown
  timestamp?: string
}

export type ApiErrorPayload = {
  message: string
  status: number
  errors?: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly errors?: unknown

  constructor(payload: ApiErrorPayload) {
    super(payload.message)
    this.name = 'ApiError'
    this.status = payload.status
    this.errors = payload.errors
  }
}
