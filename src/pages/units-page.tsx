import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  createUnit,
  deactivateUnit,
  fetchUnits,
  updateUnit,
  type ProductUnit,
} from '../features/units/units-api'
import { ConfirmModal, type ConfirmState } from '../features/ui/confirm-modal'
import { Modal } from '../features/ui/modal'
import { useToast } from '../features/ui/toast-context'

function isUnitEnabled(unit: ProductUnit): boolean {
  return unit.isActive ?? unit.active ?? false
}

function mapUnitDeactivateError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Failed to deactivate unit'
  if (message.toLowerCase().includes('active products are using')) {
    return 'Cannot deactivate this unit because active products are using it. Update those products first.'
  }
  return message
}

export function UnitsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { pushToast } = useToast()
  const [units, setUnits] = useState<ProductUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [page, setPage] = useState(Math.max(0, Number(searchParams.get('page') ?? 0)))
  const [pageSize, setPageSize] = useState(() => {
    const parsed = Number(searchParams.get('size') ?? 10)
    return [10, 20, 50].includes(parsed) ? parsed : 0
  })

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState({
    name: '',
    abbreviation: '',
  })

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editUnitId, setEditUnitId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    abbreviation: '',
    isActive: true,
  })

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const rows = await fetchUnits()
        if (!cancelled) setUnits(rows)
      } catch (err) {
        if (!cancelled) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to load units')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [pushToast, refreshKey])

  const activeCount = useMemo(() => units.filter((unit) => isUnitEnabled(unit)).length, [units])

  const totalPages = Math.max(1, Math.ceil(units.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const pagedUnits = useMemo(
    () => units.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [pageSize, safePage, units],
  )

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (page !== 0) next.set('page', String(page))
    else next.delete('page')
    if (pageSize !== 20) next.set('size', String(pageSize))
    else next.delete('size')
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [page, pageSize, searchParams, setSearchParams])

  const openCreateModal = () => {
    setCreateForm({ name: '', abbreviation: '' })
    setCreateError(null)
    setCreateModalOpen(true)
  }

  const closeCreateModal = () => {
    if (createSubmitting) return
    setCreateModalOpen(false)
    setCreateError(null)
  }

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateError(null)
    if (!createForm.name.trim()) {
      setCreateError('Unit name is required.')
      pushToast('error', 'Unit name is required.')
      return
    }
    if (!createForm.abbreviation.trim()) {
      setCreateError('Abbreviation is required.')
      pushToast('error', 'Abbreviation is required.')
      return
    }

    setCreateSubmitting(true)
    try {
      await createUnit({
        name: createForm.name.trim(),
        abbreviation: createForm.abbreviation.trim().toUpperCase(),
      })
      setCreateModalOpen(false)
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Unit created successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create unit'
      setCreateError(message)
      pushToast('error', message)
    } finally {
      setCreateSubmitting(false)
    }
  }

  const openEditModal = (unit: ProductUnit) => {
    setEditUnitId(unit.id)
    setEditForm({
      name: unit.name ?? '',
      abbreviation: unit.abbreviation ?? '',
      isActive: isUnitEnabled(unit),
    })
    setEditError(null)
    setEditModalOpen(true)
  }

  const closeEditModal = () => {
    if (editSubmitting) return
    setEditModalOpen(false)
    setEditUnitId(null)
    setEditError(null)
  }

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEditError(null)
    if (!editUnitId) return
    if (!editForm.name.trim()) {
      setEditError('Unit name is required.')
      pushToast('error', 'Unit name is required.')
      return
    }
    if (!editForm.abbreviation.trim()) {
      setEditError('Abbreviation is required.')
      pushToast('error', 'Abbreviation is required.')
      return
    }

    setEditSubmitting(true)
    try {
      await updateUnit(editUnitId, {
        name: editForm.name.trim(),
        abbreviation: editForm.abbreviation.trim().toUpperCase(),
        isActive: editForm.isActive,
      })
      setEditModalOpen(false)
      setEditUnitId(null)
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Unit updated successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update unit'
      setEditError(message)
      pushToast('error', message)
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDeactivate = (unit: ProductUnit) => {
    if (!isUnitEnabled(unit)) return
    setConfirmState({
      title: 'Deactivate unit',
      message: `Deactivate unit "${unit.name}"?`,
      confirmLabel: 'Deactivate',
      destructive: true,
      onConfirm: async () => {
        try {
          await deactivateUnit(unit.id)
          setRefreshKey((value) => value + 1)
          pushToast('success', `Unit "${unit.name}" deactivated.`)
        } catch (err) {
          pushToast('error', mapUnitDeactivateError(err))
        }
        setConfirmState(null)
      },
    })
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Catalog</p>
          <h2 className="font-display text-xl text-slate-900">Product Units</h2>
          <p className="text-sm text-slate-500">
            Total: {units.length} | Active: {activeCount}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Add Unit
        </button>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading units...</p> : null}

      {!loading ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Abbreviation</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedUnits.map((unit) => (
                  <tr key={unit.id} className="border-b border-slate-100">
                    <td className="px-2 py-3 font-medium text-slate-800">{unit.name}</td>
                    <td className="px-2 py-3 text-slate-700">{unit.abbreviation}</td>
                    <td className="px-2 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          isUnitEnabled(unit) ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isUnitEnabled(unit) ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(unit)}
                          className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeactivate(unit)}
                          disabled={!isUnitEnabled(unit)}
                          className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!pagedUnits.length ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-slate-500">
                      No units found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <p className="text-slate-600">
              Showing {pagedUnits.length} of {units.length}
            </p>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(0)
                }}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
              >
                <option value={10}>10 rows</option>
                <option value={20}>20 rows</option>
                <option value={50}>50 rows</option>
              </select>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                disabled={safePage === 0}
                className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Prev
              </button>
              <span className="text-slate-600">
                Page {safePage + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((prev) => (prev + 1 < totalPages ? prev + 1 : prev))}
                disabled={safePage + 1 >= totalPages}
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

      {createModalOpen ? (
        <Modal title="Create Unit" onClose={closeCreateModal}>
          <form className="space-y-3" onSubmit={submitCreate}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Unit name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={createForm.abbreviation}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, abbreviation: event.target.value.toUpperCase() }))
                }
                placeholder="Abbreviation *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            {createError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{createError}</p> : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={createSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                disabled={createSubmitting}
              >
                {createSubmitting ? 'Creating...' : 'Create Unit'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editModalOpen ? (
        <Modal title="Edit Unit" onClose={closeEditModal}>
          <form className="space-y-3" onSubmit={submitEdit}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={editForm.name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Unit name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editForm.abbreviation}
                onChange={(event) => setEditForm((prev) => ({ ...prev, abbreviation: event.target.value.toUpperCase() }))}
                placeholder="Abbreviation *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
                Active
              </label>
            </div>

            {editError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{editError}</p> : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={editSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                disabled={editSubmitting}
              >
                {editSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  )
}
