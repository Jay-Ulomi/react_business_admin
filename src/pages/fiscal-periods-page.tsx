import { type FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  closeFiscalPeriod,
  createFiscalPeriod,
  fetchFiscalPeriods,
  lockFiscalPeriod,
  reopenFiscalPeriod,
  type FiscalPeriodResponse,
} from '../features/accounting/fiscal-periods-api'
import { Modal } from '../features/ui/modal'
import { ConfirmModal, type ConfirmState } from '../features/ui/confirm-modal'
import { useToast } from '../features/ui/toast-context'

const today = new Date()
const thisYear = today.getFullYear()

function statusClass(status: FiscalPeriodResponse['status']): string {
  if (status === 'OPEN') return 'bg-emerald-100 text-emerald-800'
  if (status === 'CLOSED') return 'bg-amber-100 text-amber-800'
  return 'bg-slate-100 text-slate-700'
}

export function FiscalPeriodsPage() {
  const { pushToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [periods, setPeriods] = useState<FiscalPeriodResponse[]>([])
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '0') || 0)
  const [size, setSize] = useState(Number(searchParams.get('size') ?? '20') || 20)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: `FY ${thisYear}`,
    startDate: `${thisYear}-01-01`,
    endDate: `${thisYear}-12-31`,
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
        const result = await fetchFiscalPeriods({ page, size })
        if (cancelled) return
        setPeriods(result.content)
        setTotalPages(result.totalPages)
        setTotalElements(result.totalElements)
      } catch (err) {
        if (!cancelled) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to load fiscal periods')
        }
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

    if (!createForm.name.trim()) {
      pushToast('error', 'Name is required.')
      return
    }
    if (!createForm.startDate || !createForm.endDate) {
      pushToast('error', 'Start date and end date are required.')
      return
    }
    if (createForm.endDate < createForm.startDate) {
      pushToast('error', 'End date must be on or after start date.')
      return
    }

    setCreateSubmitting(true)
    try {
      await createFiscalPeriod({
        name: createForm.name.trim(),
        startDate: createForm.startDate,
        endDate: createForm.endDate,
      })
      setCreateOpen(false)
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Fiscal period created and opened.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to create fiscal period')
    } finally {
      setCreateSubmitting(false)
    }
  }

  const handleClose = (period: FiscalPeriodResponse) => {
    setConfirmState({
      title: 'Close fiscal period',
      message: `Close fiscal period "${period.name}"?`,
      confirmLabel: 'Close',
      destructive: true,
      onConfirm: async () => {
        setConfirmState(null)
        setBusyId(period.id)
        try {
          await closeFiscalPeriod(period.id)
          setRefreshKey((value) => value + 1)
          pushToast('success', `Fiscal period "${period.name}" closed.`)
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to close fiscal period')
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  const handleReopen = (period: FiscalPeriodResponse) => {
    setConfirmState({
      title: 'Reopen fiscal period',
      message: `Reopen fiscal period "${period.name}"?`,
      confirmLabel: 'Reopen',
      destructive: false,
      onConfirm: async () => {
        setConfirmState(null)
        setBusyId(period.id)
        try {
          await reopenFiscalPeriod(period.id)
          setRefreshKey((value) => value + 1)
          pushToast('success', `Fiscal period "${period.name}" reopened.`)
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to reopen fiscal period')
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  const handleLock = (period: FiscalPeriodResponse) => {
    setConfirmState({
      title: 'Lock fiscal period',
      message: `Lock fiscal period "${period.name}"? This action cannot be reopened.`,
      confirmLabel: 'Lock',
      destructive: true,
      onConfirm: async () => {
        setConfirmState(null)
        setBusyId(period.id)
        try {
          await lockFiscalPeriod(period.id)
          setRefreshKey((value) => value + 1)
          pushToast('success', `Fiscal period "${period.name}" locked.`)
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to lock fiscal period')
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Accounting</p>
          <h2 className="font-display text-xl text-slate-900">Fiscal Periods</h2>
          <p className="text-sm text-slate-500">Total: {totalElements} periods</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Add Fiscal Period
        </button>
      </div>

      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Sales posting is allowed only when sale date is inside an <strong>OPEN</strong> fiscal period.
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading fiscal periods...</p> : null}

      {!loading ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Start Date</th>
                  <th className="px-2 py-2 font-medium">End Date</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => {
                  const rowBusy = busyId === period.id
                  return (
                    <tr key={period.id} className="border-b border-slate-100">
                      <td className="px-2 py-3 font-medium text-slate-800">{period.name}</td>
                      <td className="px-2 py-3 font-mono text-slate-700">{period.startDate}</td>
                      <td className="px-2 py-3 font-mono text-slate-700">{period.endDate}</td>
                      <td className="px-2 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(period.status)}`}
                        >
                          {period.status}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {period.status === 'OPEN' ? (
                            <button
                              type="button"
                              onClick={() => handleClose(period)}
                              disabled={rowBusy}
                              className="rounded-lg border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"
                            >
                              Close
                            </button>
                          ) : null}

                          {period.status === 'CLOSED' ? (
                            <button
                              type="button"
                              onClick={() => handleReopen(period)}
                              disabled={rowBusy}
                              className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                            >
                              Reopen
                            </button>
                          ) : null}

                          {period.status === 'CLOSED' ? (
                            <button
                              type="button"
                              onClick={() => handleLock(period)}
                              disabled={rowBusy}
                              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              Lock
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {periods.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-sm text-slate-500">
                      No fiscal periods defined.
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
        <Modal title="Create Fiscal Period" onClose={() => !createSubmitting && setCreateOpen(false)}>
          <form className="space-y-3" onSubmit={submitCreate}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
              <label className="text-sm text-slate-700">
                Start Date
                <input
                  type="date"
                  value={createForm.startDate}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm text-slate-700">
                End Date
                <input
                  type="date"
                  value={createForm.endDate}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, endDate: event.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
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
                {createSubmitting ? 'Creating...' : 'Create & Open'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  )
}
