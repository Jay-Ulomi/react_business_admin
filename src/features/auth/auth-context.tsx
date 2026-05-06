import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { apiRequest, configureHttpAuth } from '../../lib/http'
import { storage } from '../../lib/storage'
import type {
  AuthResponse,
  AuthSession,
  LoginRequest,
  SwitchContextRequest,
  SwitchContextResponse,
} from './types'

type AuthContextValue = {
  session: AuthSession | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (request: LoginRequest) => Promise<void>
  refreshSession: () => Promise<void>
  switchContext: (request: SwitchContextRequest) => Promise<SwitchContextResponse>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function mapAuthSession(payload: AuthResponse): AuthSession {
  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    userId: payload.userId,
    email: payload.email,
    firstName: payload.firstName,
    lastName: payload.lastName,
    role: payload.role,
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(() => storage.getSession())
  const [isLoading, setIsLoading] = useState(false)
  const recoveryInFlightRef = useRef<Promise<void> | null>(null)
  // Stable ref so the unauthorized handler always points to the latest recoverUnauthorized
  // without needing to re-run configureHttpAuth every time it changes.
  const recoverUnauthorizedRef = useRef<() => Promise<void>>(async () => {})

  const persistSession = useCallback((next: AuthSession | null) => {
    setSession(next)
    if (next) {
      storage.setSession(next)
    } else {
      storage.clearSession()
    }
  }, [])

  const restoreContextIfAvailable = useCallback(async () => {
    const context = storage.getContext()
    if (!context?.businessId || !context?.branchId) return

    const response = await apiRequest<SwitchContextResponse>('/api/auth/switch-context', {
      method: 'POST',
      body: {
        businessId: context.businessId,
        branchId: context.branchId,
      },
    })

    persistSession({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      userId: response.userId,
      email: response.email,
      role: response.roleName,
    })
  }, [persistSession])

  const refreshSession = useCallback(async () => {
    const existing = storage.getSession()
    if (!existing?.refreshToken) {
      throw new Error('Missing refresh token')
    }

    const response = await apiRequest<AuthResponse>('/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: existing.refreshToken },
    })

    persistSession(mapAuthSession(response))
    await restoreContextIfAvailable()
  }, [persistSession, restoreContextIfAvailable])

  const logout = useCallback(() => {
    persistSession(null)
    storage.clearContext()
  }, [persistSession])

  const login = useCallback(
    async (request: LoginRequest) => {
      setIsLoading(true)
      try {
        const response = await apiRequest<AuthResponse>('/api/auth/login', {
          method: 'POST',
          body: request,
        })
        persistSession(mapAuthSession(response))
      } finally {
        setIsLoading(false)
      }
    },
    [persistSession],
  )

  const switchContext = useCallback(
    async (request: SwitchContextRequest) => {
      const response = await apiRequest<SwitchContextResponse>('/api/auth/switch-context', {
        method: 'POST',
        body: request,
      })
      persistSession({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        userId: response.userId,
        email: response.email,
        role: response.roleName,
      })
      return response
    },
    [persistSession],
  )

  const recoverUnauthorized = useCallback(async () => {
    if (recoveryInFlightRef.current) {
      await recoveryInFlightRef.current
      return
    }

    recoveryInFlightRef.current = (async () => {
      try {
        await refreshSession()
      } catch (error) {
        logout()
        throw error
      } finally {
        recoveryInFlightRef.current = null
      }
    })()

    await recoveryInFlightRef.current
  }, [logout, refreshSession])

  // Keep the ref up to date so the stable handler below always calls the latest version.
  recoverUnauthorizedRef.current = recoverUnauthorized

  // Configure http auth ONCE during the render phase (via lazy useState initializer).
  // useEffect runs AFTER children's effects, so anything that fires in a child's
  // useEffect (e.g. BusinessProvider loading businesses) would miss the Authorization
  // header. A lazy initializer runs synchronously on the first render — before any
  // effects — so it is already set up when child effects run.
  useState(() => {
    configureHttpAuth(
      () => {
        const current = storage.getSession()
        if (!current) return null
        return { accessToken: current.accessToken, refreshToken: current.refreshToken }
      },
      () => recoverUnauthorizedRef.current(),
    )
  })

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session?.accessToken),
      isLoading,
      login,
      refreshSession,
      switchContext,
      logout,
    }),
    [isLoading, login, logout, refreshSession, session, switchContext],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
