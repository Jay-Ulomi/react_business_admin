import { useMemo, useState } from 'react'
import { useBusinessContext } from './business-context'
import { useToast } from '../ui/toast-context'

export function ContextSwitcher() {
  const { businessAccesses, branches, selectedContext, selectContext, isLoading } = useBusinessContext()
  const { pushToast } = useToast()
  const [pending, setPending] = useState(false)

  const selectedBusinessId = selectedContext?.businessId ?? businessAccesses[0]?.businessId ?? ''
  const selectedBranchId = selectedContext?.branchId ?? branches[0]?.id ?? ''

  const branchOptions = useMemo(
    () => branches.filter((branch) => branch.active ?? branch.isActive).map((branch) => ({ id: branch.id, name: branch.name })),
    [branches],
  )

  const applySelection = async (businessId: string, branchId: string) => {
    if (!businessId || !branchId) return
    setPending(true)
    try {
      await selectContext(businessId, branchId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to switch branch'
      pushToast('error', message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {businessAccesses.length > 1 && (
        <select
          aria-label="Select business"
          className="w-[130px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400 disabled:opacity-50"
          value={selectedBusinessId}
          onChange={(event) => {
            const nextBusinessId = event.target.value
            const fallbackBranchId = branchOptions[0]?.id ?? ''
            void applySelection(nextBusinessId, fallbackBranchId)
          }}
          disabled={isLoading || pending}
        >
          {businessAccesses.map((access) => (
            <option key={access.businessId} value={access.businessId}>
              {access.businessName}
            </option>
          ))}
        </select>
      )}

      {branchOptions.length > 1 && (
        <select
          aria-label="Select branch"
          className="w-[120px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400 disabled:opacity-50"
          value={selectedBranchId}
          onChange={(event) => {
            void applySelection(selectedBusinessId, event.target.value)
          }}
          disabled={isLoading || pending}
        >
          {branchOptions.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
