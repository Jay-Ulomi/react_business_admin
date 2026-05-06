import type { AuthSession, BusinessContextSelection } from '../features/auth/types'

const SESSION_KEY = 'business_admin_session'
const CONTEXT_KEY = 'business_admin_context'

function safeParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export const storage = {
  getSession(): AuthSession | null {
    return safeParse<AuthSession>(localStorage.getItem(SESSION_KEY))
  },

  setSession(session: AuthSession): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  },

  clearSession(): void {
    localStorage.removeItem(SESSION_KEY)
  },

  getContext(): BusinessContextSelection | null {
    return safeParse<BusinessContextSelection>(localStorage.getItem(CONTEXT_KEY))
  },

  setContext(selection: BusinessContextSelection): void {
    localStorage.setItem(CONTEXT_KEY, JSON.stringify(selection))
  },

  clearContext(): void {
    localStorage.removeItem(CONTEXT_KEY)
  },
}
