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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700"
        value={selectedBusinessId}
        onChange={(event) => {
          const nextBusinessId = event.target.value
          const fallbackBranchId = branchOptions[0]?.id ?? ''
          void applySelection(nextBusinessId, fallbackBranchId)
        }}
        disabled={isLoading || pending || businessAccesses.length === 0}
      >
        {businessAccesses.map((access) => (
          <option key={access.businessId} value={access.businessId}>
            {access.businessName}
          </option>
        ))}
      </select>

      <select
        className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700"
        value={selectedBranchId}
        onChange={(event) => {
          void applySelection(selectedBusinessId, event.target.value)
        }}
        disabled={isLoading || pending || branchOptions.length === 0}
      >
        {branchOptions.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </div>
  )
}
