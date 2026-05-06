import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { useAuth } from '../auth/auth-context'
import type {
  BranchResponse,
  BusinessAccess,
  BusinessContextSelection,
  SwitchContextResponse,
} from '../auth/types'
import { apiRequest } from '../../lib/http'
import { storage } from '../../lib/storage'

type BusinessContextValue = {
  businessAccesses: BusinessAccess[]
  branches: BranchResponse[]
  selectedContext: BusinessContextSelection | null
  isLoading: boolean
  loadContexts: () => Promise<BusinessAccess[]>
  selectContext: (businessId: string, branchId: string) => Promise<SwitchContextResponse>
}

const BusinessContext = createContext<BusinessContextValue | null>(null)

function toSelection(response: SwitchContextResponse): BusinessContextSelection {
  return {
    businessId: response.businessId,
    businessName: response.businessName,
    businessType: undefined,
    branchId: response.branchId,
    branchName: response.branchName,
    tenantId: response.tenantId,
    roleName: response.roleName,
  }
}

export function BusinessProvider({ children }: PropsWithChildren) {
  const { isAuthenticated, switchContext } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [businessAccesses, setBusinessAccesses] = useState<BusinessAccess[]>([])
  const [branches, setBranches] = useState<BranchResponse[]>([])
  const [selectedContext, setSelectedContext] = useState<BusinessContextSelection | null>(() =>
    storage.getContext(),
  )
  // Tracks whether we've already done the one-time context restore on this auth session.
  // Prevents the auto-select from firing again when selectContext causes a re-render.
  const hasInitializedRef = useRef(false)

  const selectContext = useCallback(
    async (businessId: string, branchId: string) => {
      const response = await switchContext({ businessId, branchId })
      const business = await apiRequest<{ id: string; type?: string | null }>(`/api/businesses/${businessId}`)
      const selection = { ...toSelection(response), businessType: business.type ?? undefined }
      setSelectedContext(selection)
      storage.setContext(selection)

      const branchList = await apiRequest<BranchResponse[]>(`/api/businesses/${businessId}/branches`)
      setBranches(branchList)
      return response
    },
    [switchContext],
  )

  // loadContexts deps: only isAuthenticated and selectContext (both stable).
  // selectContext is excluded from the "causes re-run" chain because it doesn't
  // depend on selectedContext — so there's no infinite loop when auto-select fires.
  const loadContexts = useCallback(async () => {
    if (!isAuthenticated) return []
    setIsLoading(true)
    try {
      const [accesses, businesses] = await Promise.all([
        apiRequest<BusinessAccess[]>('/api/users/me/businesses'),
        apiRequest<Array<{ id: string; type?: string | null }>>('/api/businesses'),
      ])
      const businessTypeById = new Map(
        businesses.map((b) => [b.id, b.type ?? undefined]),
      )
      const enrichedAccesses = accesses.map((access) => ({
        ...access,
        businessType: businessTypeById.get(access.businessId),
      }))
      setBusinessAccesses(enrichedAccesses)

      // Only attempt the initial context restore once per auth session
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true
        const saved = storage.getContext()
        const targetAccess = saved?.businessId
          ? (enrichedAccesses.find((a) => a.businessId === saved.businessId) ?? enrichedAccesses[0])
          : enrichedAccesses[0]
        const targetBusinessId = targetAccess?.businessId

        if (targetBusinessId) {
          // Load branch list for the ContextSwitcher UI
          const branchList = await apiRequest<BranchResponse[]>(
            `/api/businesses/${targetBusinessId}/branches`,
          )
          setBranches(branchList)

          // Pick the branch to switch into:
          // 1. Saved branch (if the user still has access to it)
          // 2. First active branch the user has explicit access to (from branchAccesses)
          // 3. First branch in the full list as last resort
          const accessibleBranchIds = new Set(
            targetAccess?.branchAccesses.map((b) => b.branchId) ?? [],
          )
          const savedBranchId = saved?.branchId && accessibleBranchIds.has(saved.branchId)
            ? saved.branchId
            : undefined
          const firstAccessibleBranchId =
            targetAccess?.branchAccesses.find((b) => b.isActive)?.branchId ??
            targetAccess?.branchAccesses[0]?.branchId
          const branchId = savedBranchId ?? firstAccessibleBranchId ?? branchList[0]?.id

          if (branchId) {
            try {
              await selectContext(targetBusinessId, branchId)
            } catch {
              // If even the accessible branch failed, clear saved context and give up gracefully
              storage.clearContext()
              setSelectedContext(null)
            }
          }
        }
      }

      return enrichedAccesses
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, selectContext])

  useEffect(() => {
    if (!isAuthenticated) {
      setBusinessAccesses([])
      setBranches([])
      setSelectedContext(null)
      hasInitializedRef.current = false
      return
    }
    void loadContexts()
  }, [isAuthenticated, loadContexts])

  const value = useMemo<BusinessContextValue>(
    () => ({
      businessAccesses,
      branches,
      selectedContext,
      isLoading,
      loadContexts,
      selectContext,
    }),
    [branches, businessAccesses, isLoading, loadContexts, selectContext, selectedContext],
  )

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}

export function useBusinessContext(): BusinessContextValue {
  const context = useContext(BusinessContext)
  if (!context) {
    throw new Error('useBusinessContext must be used inside BusinessProvider')
  }
  return context
}
