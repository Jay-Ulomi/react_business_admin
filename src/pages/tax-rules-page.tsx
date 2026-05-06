import { type FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  createTaxRule,
  deactivateTaxRule,
  fetchTaxRules,
  updateTaxRule,
  type TaxRuleResponse,
} from '../features/accounting/tax-rules-api'
import { Modal } from '../features/ui/modal'
import { ConfirmModal, type ConfirmState } from '../features/ui/confirm-modal'
import { useToast } from '../features/ui/toast-context'

export function TaxRulesPage() {
  const { pushToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [rules, setRules] = useState<TaxRuleResponse[]>([])
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '0') || 0)
  const [size, setSize] = useState(Number(searchParams.get('size') ?? '20') || 20)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    code: '',
    rate: '',
    description: '',
    isDefault: false,
    isCompound: false,
  })

  const [editOpen, setEditOpen] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    code: '',
    rate: '',
    description: '',
    isActive: true,
    isDefault: false,
    isCompound: false,
  })

  useEffect(() => {
    const next = new URLSearchParams()
    if (page !== 0) next.set('page', String(page))
    if (size !== 20) next.set('size', String(size))
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [page, size, searchParams, setSearchParams])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const result = await fetchTaxRules({ page, size })
        if (cancelled) return
        setRules(result.content)
        setTotalPages(result.totalPages)
        setTotalElements(result.totalElements)
      } catch (err) {
        if (!cancelled)
          pushToast('error', err instanceof Error ? err.message : 'Failed to load tax rules')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [page, size, refreshKey, pushToast])

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!createForm.name.trim() || !createForm.code.trim()) {
      pushToast('error', 'Name and code are required.')
      return
    }
    const rate = Number(createForm.rate)
    if (!Number.isFinite(rate) || rate < 0) {
      pushToast('error', 'Rate must be a non-negative number.')
      return
    }
    setCreateSubmitting(true)
    try {
      await createTaxRule({
        name: createForm.name.trim(),
        code: createForm.code.trim(),
        rate,
        description: createForm.description.trim() || undefined,
        isDefault: createForm.isDefault,
        isCompound: createForm.isCompound,
      })
      setCreateOpen(false)
      setCreateForm({
        name: '',
        code: '',
        rate: '',
        description: '',
        isDefault: false,
        isCompound: false,
      })
      setRefreshKey((v) => v + 1)
      pushToast('success', 'Tax rule created.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to create tax rule')
    } finally {
      setCreateSubmitting(false)
    }
  }

  const openEdit = (rule: TaxRuleResponse) => {
    setEditId(rule.id)
    setEditForm({
      name: rule.name,
      code: rule.code,
      rate: String(rule.rate ?? ''),
      description: rule.description ?? '',
      isActive: rule.isActive,
      isDefault: rule.isDefault,
      isCompound: rule.isCompound,
    })
    setEditOpen(true)
  }

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editId) return
    const rate = Number(editForm.rate)
    if (!Number.isFinite(rate) || rate < 0) {
      pushToast('error', 'Rate must be a non-negative number.')
      return
    }
    setEditSubmitting(true)
    try {
      await updateTaxRule(editId, {
        name: editForm.name.trim(),
        code: editForm.code.trim(),
        rate,
        description: editForm.description.trim() || undefined,
        isActive: editForm.isActive,
        isDefault: editForm.isDefault,
        isCompound: editForm.isCompound,
      })
      setEditOpen(false)
      setEditId(null)
      setRefreshKey((v) => v + 1)
      pushToast('success', 'Tax rule updated.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to update tax rule')
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDeactivate = (rule: TaxRuleResponse) => {
    if (!rule.isActive) return
    setConfirmState({
      title: 'Deactivate tax rule',
      message: `Deactivate tax rule "${rule.name}"?`,
      confirmLabel: 'Deactivate',
      destructive: true,
      onConfirm: async () => {
        try {
          await deactivateTaxRule(rule.id)
          setRefreshKey((v) => v + 1)
          pushToast('success', 'Tax rule deactivated.')
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to deactivate tax rule')
        }
        setConfirmState(null)
      },
    })
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Accounting</p>
          <h2 className="font-display text-xl text-slate-900">Tax Rules</h2>
          <p className="text-sm text-slate-500">Total: {totalElements} rules</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Add Tax Rule
        </button>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading tax rules...</p> : null}

      {!loading ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Code</th>
                  <th className="px-2 py-2 text-right font-medium">Rate (%)</th>
                  <th className="px-2 py-2 font-medium">Flags</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b border-slate-100">
                    <td className="px-2 py-3 font-medium text-slate-800">{rule.name}</td>
                    <td className="px-2 py-3 font-mono text-slate-700">{rule.code}</td>
                    <td className="px-2 py-3 text-right font-mono text-slate-800">
                      {Number(rule.rate).toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-xs text-slate-600">
                      {rule.isDefault ? (
                        <span className="mr-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                          Default
                        </span>
                      ) : null}
                      {rule.isCompound ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                          Compound
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          rule.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(rule)}
                          className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeactivate(rule)}
                          disabled={!rule.isActive}
                          className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-6 text-center text-sm text-slate-500">
                      No tax rules defined.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <p className="text-slate-600">
              Page {totalPages === 0 ? 0 : page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <select
                value={size}
                onChange={(event) => {
                  setSize(Number(event.target.value))
                  setPage(0)
                }}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm"
              >
                <option value={10}>10 rows</option>
                <option value={20}>20 rows</option>
                <option value={50}>50 rows</option>
              </select>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                disabled={page + 1 >= totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmState ? (
        <ConfirmModal
          {...confirmState}
          onClose={() => setConfirmState(null)}
        />
      ) : null}

      {createOpen ? (
        <Modal title="Create Tax Rule" onClose={() => !createSubmitting && setCreateOpen(false)}>
          <form className="space-y-3" onSubmit={submitCreate}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={createForm.name}
                onChange={(event) => setCreateForm((p) => ({ ...p, name: event.target.value }))}
                placeholder="Name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={createForm.code}
                onChange={(event) => setCreateForm((p) => ({ ...p, code: event.target.value }))}
                placeholder="Code *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={createForm.rate}
                onChange={(event) => setCreateForm((p) => ({ ...p, rate: event.target.value }))}
                placeholder="Rate % *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={createForm.isDefault}
                    onChange={(event) =>
                      setCreateForm((p) => ({ ...p, isDefault: event.target.checked }))
                    }
                  />
                  Default
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={createForm.isCompound}
                    onChange={(event) =>
                      setCreateForm((p) => ({ ...p, isCompound: event.target.checked }))
                    }
                  />
                  Compound
                </label>
              </div>
              <textarea
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((p) => ({ ...p, description: event.target.value }))
                }
                placeholder="Description"
                rows={3}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                disabled={createSubmitting}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createSubmitting}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {createSubmitting ? 'Creating...' : 'Create Tax Rule'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editOpen ? (
        <Modal title="Edit Tax Rule" onClose={() => !editSubmitting && setEditOpen(false)}>
          <form className="space-y-3" onSubmit={submitEdit}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={editForm.name}
                onChange={(event) => setEditForm((p) => ({ ...p, name: event.target.value }))}
                placeholder="Name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editForm.code}
                onChange={(event) => setEditForm((p) => ({ ...p, code: event.target.value }))}
                placeholder="Code *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.rate}
                onChange={(event) => setEditForm((p) => ({ ...p, rate: event.target.value }))}
                placeholder="Rate % *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(event) =>
                      setEditForm((p) => ({ ...p, isActive: event.target.checked }))
                    }
                  />
                  Active
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={editForm.isDefault}
                    onChange={(event) =>
                      setEditForm((p) => ({ ...p, isDefault: event.target.checked }))
                    }
                  />
                  Default
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={editForm.isCompound}
                    onChange={(event) =>
                      setEditForm((p) => ({ ...p, isCompound: event.target.checked }))
                    }
                  />
                  Compound
                </label>
              </div>
              <textarea
                value={editForm.description}
                onChange={(event) =>
                  setEditForm((p) => ({ ...p, description: event.target.value }))
                }
                placeholder="Description"
                rows={3}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                disabled={editSubmitting}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSubmitting}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {editSubmitting ? 'Saving...' : 'Save Tax Rule'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  )
}
