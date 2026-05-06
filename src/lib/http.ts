import { ApiError, type ApiEnvelope } from '../types/api'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type RequestOptions = {
  method?: HttpMethod
  body?: unknown
  signal?: AbortSignal
}

type AuthTokens = {
  accessToken: string
  refreshToken: string
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://pos.chita.co.tz'

let getTokens: (() => AuthTokens | null) | null = null
let onUnauthorized: (() => Promise<void>) | null = null

export function configureHttpAuth(
  tokenProvider: () => AuthTokens | null,
  unauthorizedHandler: () => Promise<void>,
): void {
  getTokens = tokenProvider
  onUnauthorized = unauthorizedHandler
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const isAuthEndpoint = path.startsWith('/api/auth/')
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  const tokens = getTokens?.()
  if (tokens?.accessToken) {
    headers.Authorization = `Bearer ${tokens.accessToken}`
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const send = async (): Promise<Response> =>
    fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })

  let response = await send()

  // Some backends return 403 for expired/invalid JWT instead of 401.
  // Treat both as recoverable auth failures and try refresh once.
  // Never run auth recovery while calling auth endpoints themselves.
  if (!isAuthEndpoint && (response.status === 401 || response.status === 403) && onUnauthorized) {
    await onUnauthorized()
    const updatedTokens = getTokens?.()
    if (updatedTokens?.accessToken) {
      headers.Authorization = `Bearer ${updatedTokens.accessToken}`
    } else {
      delete headers.Authorization
    }
    response = await send()
  }

  const contentType = response.headers.get('content-type')
  const isJson = contentType?.includes('application/json')
  const parsed = isJson ? ((await response.json()) as ApiEnvelope<T>) : null

  if (!response.ok) {
    throw new ApiError({
      message: parsed?.message || `Request failed (${response.status})`,
      status: response.status,
      errors: parsed?.errors,
    })
  }

  if (!parsed) {
    throw new ApiError({
      message: 'Unexpected empty response body',
      status: response.status,
    })
  }

  return parsed.data
}
