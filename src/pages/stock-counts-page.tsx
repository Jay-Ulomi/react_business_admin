import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useBusinessContext } from '../features/context/business-context'
import { fetchProducts, type ProductResponse } from '../features/products/products-api'
import {
  addStockCountItem,
  cancelStockCount,
  createStockCount,
  fetchStockCount,
  fetchStockCountsByBranch,
  finalizeStockCount,
  type StockCountResponse,
  type StockCountStatus,
} from '../features/inventory/stock-counts-api'
import {
  createJournalEntry,
  fetchJournals,
  postJournalEntry,
  type JournalResponse,
} from '../features/accounting/journal-entries-api'
import {
  fetchAccountsByType,
  type AccountResponse,
} from '../features/accounting/chart-of-accounts-api'
import { Modal } from '../features/ui/modal'
import { useToast } from '../features/ui/toast-context'
import { formatDate } from '../lib/format'

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function weekAgoIsoDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

function monthAgoIsoDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

function statusBadgeClass(status: StockCountStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'bg-slate-100 text-slate-700'
    case 'IN_PROGRESS':
      return 'bg-sky-100 text-sky-800'
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-800'
    case 'CANCELED':
      return 'bg-rose-100 text-rose-800'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function isEditable(status: StockCountStatus): boolean {
  return status === 'DRAFT' || status === 'IN_PROGRESS'
}

export function StockCountsPage() {
  const { selectedContext } = useBusinessContext()
  const { pushToast } = useToast()

  const [counts, setCounts] = useState<StockCountResponse[]>([])
  const [products, setProducts] = useState<ProductResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [statusFilter, setStatusFilter] = useState<'ALL' | StockCountStatus>('ALL')
  const [fromDate, setFromDate] = useState(monthAgoIsoDate())
  const [toDate, setToDate] = useState(todayIsoDate())
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(15)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState({
    countDate: todayIsoDate(),
    notes: '',
  })

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailCount, setDetailCount] = useState<StockCountResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [addItemProductId, setAddItemProductId] = useState('')
  const [addItemCountedQty, setAddItemCountedQty] = useState('0')
  const [addItemNotes, setAddItemNotes] = useState('')
  const [addItemSubmitting, setAddItemSubmitting] = useState(false)
  const [workflowSubmitting, setWorkflowSubmitting] = useState(false)

  const [jeOpen, setJeOpen] = useState(false)
  const [jeVariance, setJeVariance] = useState(0)
  const [jeCountNotes, setJeCountNotes] = useState('')
  const [jeCountId, setJeCountId] = useState('')
  const [journals, setJournals] = useState<JournalResponse[]>([])
  const [allAccounts, setAllAccounts] = useState<AccountResponse[]>([])
  const [jeJournalId, setJeJournalId] = useState('')
  const [jeDebitId, setJeDebitId] = useState('')
  const [jeCreditId, setJeCreditId] = useState('')
  const [jeAmount, setJeAmount] = useState('')
  const [jeSubmitting, setJeSubmitting] = useState(false)
  const [jeError, setJeError] = useState<string | null>(null)

  const branchId = selectedContext?.branchId

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const [countsResult, productsResult] = await Promise.all([
          fetchStockCountsByBranch(branchId),
          fetchProducts({ isActive: true, size: 500, sortBy: 'name', sortDir: 'asc' }),
        ])
        if (cancelled) return
        setCounts(countsResult)
        setProducts(productsResult.content)
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load stock counts'
          setError(message)
          pushToast('error', message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [branchId, refreshKey, pushToast])

  const filteredCounts = useMemo(() => {
    return counts.filter((count) => {
      if (statusFilter !== 'ALL' && count.status !== statusFilter) return false
      if (fromDate && count.countDate && count.countDate < fromDate) return false
      if (toDate && count.countDate && count.countDate > toDate) return false
      return true
    })
  }, [counts, statusFilter, fromDate, toDate])

  const totalPages = Math.max(1, Math.ceil(filteredCounts.length / size))
  const pagedCounts = useMemo(
    () => filteredCounts.slice(page * size, page * size + size),
    [filteredCounts, page, size],
  )

  const productById = useMemo(() => {
    const map = new Map<string, ProductResponse>()
    products.forEach((p) => map.set(p.id, p))
    return map
  }, [products])

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase()
    if (!term) return products.slice(0, 50)
    return products.filter((p) => p.name.toLowerCase().includes(term) || (p.sku ?? '').toLowerCase().includes(term)).slice(0, 50)
  }, [products, productSearch])

  const openCreateModal = () => {
    setCreateForm({ countDate: todayIsoDate(), notes: '' })
    setCreateError(null)
    setCreateModalOpen(true)
  }

  const closeCreateModal = () => {
    if (createSubmitting) return
    setCreateModalOpen(false)
  }

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateError(null)
    if (!branchId) {
      const msg = 'Select a branch context before creating a stock count.'
      setCreateError(msg)
      pushToast('error', msg)
      return
    }
    setCreateSubmitting(true)
    try {
      const created = await createStockCount({
        branchId,
        countDate: createForm.countDate || undefined,
        notes: createForm.notes.trim() || undefined,
      })
      setCreateModalOpen(false)
      setRefreshKey((v) => v + 1)
      pushToast('success', 'Stock count created successfully.')
      void openDetail(created.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create stock count'
      setCreateError(message)
      pushToast('error', message)
    } finally {
      setCreateSubmitting(false)
    }
  }

  const openDetail = async (stockCountId: string) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailError(null)
    setDetailCount(null)
    setAddItemProductId('')
    setAddItemCountedQty('0')
    setAddItemNotes('')
    setProductSearch('')
    try {
      const count = await fetchStockCount(stockCountId)
      setDetailCount(count)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load stock count'
      setDetailError(message)
      pushToast('error', message)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    if (addItemSubmitting || workflowSubmitting) return
    setDetailOpen(false)
    setDetailCount(null)
  }

  const submitAddItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detailCount) return
    if (!addItemProductId) {
      pushToast('error', 'Select a product.')
      return
    }
    const qty = Number(addItemCountedQty)
    if (!Number.isFinite(qty) || qty < 0) {
      pushToast('error', 'Counted quantity must be >= 0.')
      return
    }
    setAddItemSubmitting(true)
    try {
      const updated = await addStockCountItem(detailCount.id, {
        productId: addItemProductId,
        countedQuantity: qty,
        notes: addItemNotes.trim() || undefined,
      })
      setDetailCount(updated)
      setAddItemProductId('')
      setAddItemCountedQty('0')
      setAddItemNotes('')
      setProductSearch('')
      setRefreshKey((v) => v + 1)
      pushToast('success', 'Count item saved.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save item'
      pushToast('error', message)
    } finally {
      setAddItemSubmitting(false)
    }
  }

  const updateCountedQty = async (productId: string, qtyString: string, notes?: string) => {
    if (!detailCount) return
    const qty = Number(qtyString)
    if (!Number.isFinite(qty) || qty < 0) {
      pushToast('error', 'Counted quantity must be >= 0.')
      return
    }
    setAddItemSubmitting(true)
    try {
      const updated = await addStockCountItem(detailCount.id, {
        productId,
        countedQuantity: qty,
        notes,
      })
      setDetailCount(updated)
      setRefreshKey((v) => v + 1)
      pushToast('success', 'Counted qty updated.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update item'
      pushToast('error', message)
    } finally {
      setAddItemSubmitting(false)
    }
  }

  const runWorkflow = async (action: 'finalize' | 'cancel') => {
    if (!detailCount) return
    setWorkflowSubmitting(true)
    try {
      const updated =
        action === 'finalize' ? await finalizeStockCount(detailCount.id) : await cancelStockCount(detailCount.id)
      setDetailCount(updated)
      setRefreshKey((v) => v + 1)
      pushToast('success', action === 'finalize' ? 'Stock count finalized.' : 'Stock count canceled.')
      if (action === 'finalize') {
        const variance = updated.items.reduce((sum: number, item: { discrepancy?: number | null }) => sum + Number(item.discrepancy ?? 0), 0)
        if (variance !== 0) {
          try {
            const [journalList, assetList, expenseList, liabList, revenueList] = await Promise.all([
              fetchJournals(),
              fetchAccountsByType('ASSET'),
              fetchAccountsByType('EXPENSE'),
              fetchAccountsByType('LIABILITY'),
              fetchAccountsByType('REVENUE'),
            ])
            const combined = [...assetList, ...expenseList, ...liabList, ...revenueList]
            setJournals(journalList)
            setAllAccounts(combined)
            setJeJournalId(journalList[0]?.id ?? '')
            setJeDebitId('')
            setJeCreditId('')
            setJeAmount(Math.abs(variance).toFixed(2))
            setJeVariance(variance)
            setJeCountId(detailCount.id)
            setJeCountNotes(detailCount.notes ?? '')
            setJeError(null)
            setJeOpen(true)
          } catch {
            // non-critical
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Workflow action failed'
      pushToast('error', message)
    } finally {
      setWorkflowSubmitting(false)
    }
  }

  const handleSubmitStockJE = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setJeError(null)
    const amount = Number(jeAmount)
    if (!jeJournalId) { setJeError('Select a journal.'); return }
    if (!jeDebitId) { setJeError('Select the debit account.'); return }
    if (!jeCreditId) { setJeError('Select the credit account.'); return }
    if (jeDebitId === jeCreditId) { setJeError('Debit and credit accounts must differ.'); return }
    if (!Number.isFinite(amount) || amount <= 0) { setJeError('Enter a valid positive amount.'); return }
    setJeSubmitting(true)
    try {
      const entry = await createJournalEntry({
        journalId: jeJournalId,
        branchId: selectedContext?.branchId,
        entryDate: new Date().toISOString(),
        description: `Inventory adjustment – stock count${jeCountNotes ? ` (${jeCountNotes})` : ''}`,
        referenceType: 'ADJUSTMENT',
        referenceId: jeCountId,
        lines: [
          { accountId: jeDebitId, debitAmount: amount, creditAmount: 0, description: 'Inventory adjustment debit' },
          { accountId: jeCreditId, debitAmount: 0, creditAmount: amount, description: 'Inventory adjustment credit' },
        ],
      })
      await postJournalEntry(entry.id)
      setJeOpen(false)
      pushToast('success', 'Inventory adjustment journal entry posted.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to post journal entry'
      setJeError(message)
      pushToast('error', message)
    } finally {
      setJeSubmitting(false)
    }
  }

  if (!branchId) {
    return (
      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">Select a business and branch context to view stock counts.</p>
      </section>
    )
  }

  const detailEditable = detailCount ? isEditable(detailCount.status) : false
  const totalItems = detailCount?.items.length ?? 0
  const totalVariance = detailCount?.items.reduce((sum, item) => sum + Number(item.discrepancy ?? 0), 0) ?? 0

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-xl text-slate-900">Stock Counts</h2>
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            New Count
          </button>
        </div>

        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-5">
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as 'ALL' | StockCountStatus)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELED">CANCELED</option>
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={size}
            onChange={(event) => {
              setSize(Number(event.target.value))
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value={10}>10 rows</option>
            <option value={15}>15 rows</option>
            <option value={25}>25 rows</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('ALL')
              setFromDate(weekAgoIsoDate())
              setToDate(todayIsoDate())
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reset Filters
          </button>
        </div>

        {loading ? <p className="text-sm text-slate-500">Loading stock counts...</p> : null}
        {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

        {!loading && !error ? (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">Count Date</th>
                    <th className="px-2 py-2 font-medium">Items</th>
                    <th className="px-2 py-2 font-medium">Total Variance</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Created</th>
                    <th className="px-2 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCounts.map((count) => {
                    const variance = count.items.reduce((sum, item) => sum + Number(item.discrepancy ?? 0), 0)
                    return (
                      <tr key={count.id} className="border-b border-slate-100">
                        <td className="px-2 py-3 font-semibold text-slate-800">{formatDate(count.countDate)}</td>
                        <td className="px-2 py-3 text-slate-700">{count.items.length}</td>
                        <td
                          className={`px-2 py-3 font-semibold ${
                            variance === 0 ? 'text-slate-700' : variance > 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {variance > 0 ? '+' : ''}
                          {variance.toFixed(2)}
                        </td>
                        <td className="px-2 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(count.status)}`}>
                            {count.status}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-slate-600">{formatDate(count.createdAt)}</td>
                        <td className="px-2 py-3">
                          <button
                            type="button"
                            onClick={() => void openDetail(count.id)}
                            className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {pagedCounts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-2 py-6 text-center text-slate-500">
                        No stock counts match the filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-sm">
              <p className="text-slate-600">
                Total: {filteredCounts.length} | Page {filteredCounts.length === 0 ? 0 : page + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                  disabled={page === 0}
                  className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((prev) => (prev + 1 < totalPages ? prev + 1 : prev))}
                  disabled={page + 1 >= totalPages}
                  className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {createModalOpen ? (
        <Modal title="Create Stock Count" onClose={closeCreateModal}>
          <form className="space-y-3" onSubmit={submitCreate}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Branch</span>
                <input
                  value={selectedContext?.branchName ?? ''}
                  readOnly
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Count Date</span>
                <input
                  type="date"
                  value={createForm.countDate}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, countDate: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <textarea
              value={createForm.notes}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={3}
              placeholder="Notes (optional)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            {createError ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{createError}</p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateModal}
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
                {createSubmitting ? 'Creating...' : 'Create Count'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {jeOpen ? (
        <Modal title="Journal Entry – Inventory Adjustment" onClose={() => setJeOpen(false)}>
          <form className="space-y-3" onSubmit={handleSubmitStockJE}>
            <p className="text-sm text-slate-600">
              Stock count variance: <strong className={jeVariance > 0 ? 'text-emerald-700' : 'text-rose-700'}>
                {jeVariance > 0 ? '+' : ''}{jeVariance.toFixed(2)} units
              </strong>. Enter the dollar value to post as an inventory adjustment.
            </p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Journal</label>
                <select aria-label="Journal" value={jeJournalId} onChange={(e) => setJeJournalId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">Select journal…</option>
                  {journals.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Adjustment Amount</label>
                <input aria-label="Adjustment amount" type="number" min="0.01" step="0.01" value={jeAmount}
                  onChange={(e) => setJeAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Debit Account</label>
                <select aria-label="Debit account" value={jeDebitId} onChange={(e) => setJeDebitId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">Select account…</option>
                  {allAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Credit Account</label>
                <select aria-label="Credit account" value={jeCreditId} onChange={(e) => setJeCreditId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">Select account…</option>
                  {allAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
                </select>
              </div>
            </div>
            {jeError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{jeError}</p> : null}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setJeOpen(false)} disabled={jeSubmitting}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                Skip
              </button>
              <button type="submit" disabled={jeSubmitting}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {jeSubmitting ? 'Posting…' : 'Post Entry'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {detailOpen ? (
        <Modal
          title={detailCount ? `Stock Count · ${formatDate(detailCount.countDate)}` : 'Stock Count'}
          onClose={closeDetail}
          maxWidthClass="max-w-5xl"
        >
          {detailLoading ? <p className="text-sm text-slate-500">Loading count...</p> : null}
          {detailError ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{detailError}</p>
          ) : null}

          {detailCount ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <article className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(detailCount.status)}`}>
                    {detailCount.status}
                  </span>
                </article>
                <article className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Items counted</p>
                  <p className="mt-1 text-lg font-semibold text-slate-800">{totalItems}</p>
                </article>
                <article className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Total variance (qty)</p>
                  <p
                    className={`mt-1 text-lg font-semibold ${
                      totalVariance === 0 ? 'text-slate-800' : totalVariance > 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {totalVariance > 0 ? '+' : ''}
                    {totalVariance.toFixed(2)}
                  </p>
                </article>
                <article className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Completed</p>
                  <p className="mt-1 text-sm text-slate-700">{formatDate(detailCount.completedAt)}</p>
                </article>
              </div>

              {detailCount.notes ? (
                <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Notes: {detailCount.notes}
                </p>
              ) : null}

              {detailEditable ? (
                <form className="rounded-xl border border-slate-200 p-3" onSubmit={submitAddItem}>
                  <p className="mb-2 text-sm font-semibold text-slate-800">Add / update count item</p>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
                    <input
                      value={productSearch}
                      onChange={(event) => setProductSearch(event.target.value)}
                      placeholder="Search products..."
                      className="md:col-span-4 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <select
                      value={addItemProductId}
                      onChange={(event) => setAddItemProductId(event.target.value)}
                      className="md:col-span-4 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">Select product *</option>
                      {filteredProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                          {product.sku ? ` · ${product.sku}` : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={addItemCountedQty}
                      onChange={(event) => setAddItemCountedQty(event.target.value)}
                      placeholder="Counted qty"
                      className="md:col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={addItemNotes}
                      onChange={(event) => setAddItemNotes(event.target.value)}
                      placeholder="Notes"
                      className="md:col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={addItemSubmitting}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {addItemSubmitting ? 'Saving...' : 'Save Item'}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Product</th>
                      <th className="px-2 py-2 font-medium">Expected Qty</th>
                      <th className="px-2 py-2 font-medium">Counted Qty</th>
                      <th className="px-2 py-2 font-medium">Variance</th>
                      <th className="px-2 py-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailCount.items.map((item) => (
                      <CountItemRow
                        key={item.id}
                        productName={item.productName ?? productById.get(item.productId)?.name ?? '-'}
                        productId={item.productId}
                        systemQuantity={Number(item.systemQuantity ?? 0)}
                        countedQuantity={Number(item.countedQuantity ?? 0)}
                        discrepancy={Number(item.discrepancy ?? 0)}
                        notes={item.notes ?? ''}
                        editable={detailEditable}
                        disabled={addItemSubmitting || workflowSubmitting}
                        onUpdate={(qty, notes) => void updateCountedQty(item.productId, qty, notes)}
                      />
                    ))}
                    {detailCount.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                          No items counted yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void runWorkflow('cancel')}
                  disabled={
                    workflowSubmitting ||
                    detailCount.status === 'COMPLETED' ||
                    detailCount.status === 'CANCELED'
                  }
                  className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                >
                  Cancel Count
                </button>
                <button
                  type="button"
                  onClick={() => void runWorkflow('finalize')}
                  disabled={
                    workflowSubmitting ||
                    !detailEditable ||
                    detailCount.items.length === 0
                  }
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {workflowSubmitting ? 'Working...' : 'Finalize Count'}
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  )
}

type CountItemRowProps = {
  productName: string
  productId: string
  systemQuantity: number
  countedQuantity: number
  discrepancy: number
  notes: string
  editable: boolean
  disabled: boolean
  onUpdate: (qty: string, notes: string | undefined) => void
}

function CountItemRow({
  productName,
  systemQuantity,
  countedQuantity,
  discrepancy,
  notes,
  editable,
  disabled,
  onUpdate,
}: CountItemRowProps) {
  const [draftQty, setDraftQty] = useState(String(countedQuantity))
  const [draftNotes, setDraftNotes] = useState(notes)

  useEffect(() => {
    setDraftQty(String(countedQuantity))
    setDraftNotes(notes)
  }, [countedQuantity, notes])

  const dirty = draftQty !== String(countedQuantity) || draftNotes !== notes

  return (
    <tr className="border-b border-slate-100">
      <td className="px-2 py-3 font-medium text-slate-800">{productName}</td>
      <td className="px-2 py-3 text-slate-700">{systemQuantity.toFixed(2)}</td>
      <td className="px-2 py-3">
        {editable ? (
          <input
            type="number"
            min="0"
            step="0.0001"
            value={draftQty}
            disabled={disabled}
            onChange={(event) => setDraftQty(event.target.value)}
            className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm"
          />
        ) : (
          <span className="text-slate-700">{countedQuantity.toFixed(2)}</span>
        )}
      </td>
      <td
        className={`px-2 py-3 font-semibold ${
          discrepancy === 0 ? 'text-slate-700' : discrepancy > 0 ? 'text-emerald-700' : 'text-rose-700'
        }`}
      >
        {discrepancy > 0 ? '+' : ''}
        {discrepancy.toFixed(2)}
      </td>
      <td className="px-2 py-3">
        {editable ? (
          <div className="flex items-center gap-2">
            <input
              value={draftNotes}
              disabled={disabled}
              onChange={(event) => setDraftNotes(event.target.value)}
              placeholder="Notes"
              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={!dirty || disabled}
              onClick={() => onUpdate(draftQty, draftNotes.trim() || undefined)}
              className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        ) : (
          <span className="text-slate-600">{notes || '-'}</span>
        )}
      </td>
    </tr>
  )
}
