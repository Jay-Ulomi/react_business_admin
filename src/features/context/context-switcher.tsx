import { useMemo, useState } from 'react'
import { useBusinessContext } from './business-context'

export function ContextSwitcher() {
  const { businessAccesses, branches, selectedContext, selectContext, isLoading } = useBusinessContext()
  const [pending, setPending] = useState(false)

  const selectedBusinessId = selectedContext?.businessId ?? businessAccesses[0]?.businessId ?? ''
  const selectedBranchId = selectedContext?.branchId ?? branches[0]?.id ?? ''

  const branchOptions = useMemo(
    () => branches.filter((branch) => branch.isActive).map((branch) => ({ id: branch.id, name: branch.name })),
    [branches],
  )

  const applySelection = async (businessId: string, branchId: string) => {
    if (!businessId || !branchId) return
    setPending(true)
    try {
      await selectContext(businessId, branchId)
    } finally {
      setPending(false)
    }
  }

  const selectedBranch = branchOptions.find((b) => b.id === selectedBranchId)

  return (
    <div className="flex items-center gap-1.5">
      {/* Business selector — hidden when only one option */}
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

      {/* Branch selector — hidden when only one option */}
      {branchOptions.length > 1 ? (
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
      ) : (
        /* Single branch — show as a plain label, no dropdown clutter */
        selectedBranch && businessAccesses.length <= 1 ? null : (
          <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 truncate max-w-[120px]">
            {selectedBranch?.name ?? '—'}
          </span>
        )
      )}
    </div>
  )
}
