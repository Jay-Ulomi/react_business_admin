import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useBusinessContext } from '../features/context/business-context'
import { fetchBranches, type Branch } from '../features/branches/branches-api'
import { fetchProducts, type ProductResponse } from '../features/products/products-api'
import {
  approveTransfer,
  cancelTransfer,
  createTransfer,
  fetchTransfer,
  fetchTransfersByBranch,
  receiveTransfer,
  shipTransfer,
  type ReceiveTransferItemRequest,
  type TransferResponse,
  type TransferStatus,
} from '../features/inventory/transfers-api'
import { Modal } from '../features/ui/modal'
import { useToast } from '../features/ui/toast-context'
import { formatDate } from '../lib/format'

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function monthAgoIsoDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

function statusBadgeClass(status: TransferStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'bg-slate-100 text-slate-700'
    case 'PENDING':
      return 'bg-amber-100 text-amber-800'
    case 'IN_TRANSIT':
      return 'bg-sky-100 text-sky-800'
    case 'RECEIVED':
      return 'bg-emerald-100 text-emerald-800'
    case 'CANCELED':
      return 'bg-rose-100 text-rose-800'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

type TransferItemDraft = {
  productId: string
  requestedQuantity: string
  notes: string
}

type DirectionFilter = 'ALL' | 'OUTGOING' | 'INCOMING'

export function TransfersPage() {
  const { selectedContext } = useBusinessContext()
  const { pushToast } = useToast()

  const branchId = selectedContext?.branchId
  const businessId = selectedContext?.businessId

  const [transfers, setTransfers] = useState<TransferResponse[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [products, setProducts] = useState<ProductResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [statusFilter, setStatusFilter] = useState<'ALL' | TransferStatus>('ALL')
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('ALL')
  const [fromDate, setFromDate] = useState(monthAgoIsoDate())
  const [toDate, setToDate] = useState(todayIsoDate())
  const [fromBranchFilter, setFromBranchFilter] = useState('ALL')
  const [toBranchFilter, setToBranchFilter] = useState('ALL')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(15)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState({
    fromBranchId: '',
    toBranchId: '',
    transferDate: todayIsoDate(),
    notes: '',
    items: [{ productId: '', requestedQuantity: '1', notes: '' }] as TransferItemDraft[],
  })

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailTransfer, setDetailTransfer] = useState<TransferResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [workflowSubmitting, setWorkflowSubmitting] = useState(false)
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({})
  const [receiveNotes, setReceiveNotes] = useState('')

  useEffect(() => {
    if (!branchId || !businessId) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const [transfersResult, branchesResult, productsResult] = await Promise.all([
          fetchTransfersByBranch(branchId),
          fetchBranches(businessId),
          fetchProducts({ isActive: true, size: 500, sortBy: 'name', sortDir: 'asc' }),
        ])
        if (cancelled) return
        setTransfers(transfersResult)
        setBranches(branchesResult)
        setProducts(productsResult.content)
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load transfers'
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
  }, [branchId, businessId, refreshKey, pushToast])

  const branchById = useMemo(() => {
    const map = new Map<string, Branch>()
    branches.forEach((b) => map.set(b.id, b))
    return map
  }, [branches])

  const branchName = (id: string) => branchById.get(id)?.name ?? id.slice(0, 8)

  const filteredTransfers = useMemo(() => {
    return transfers.filter((transfer) => {
      if (statusFilter !== 'ALL' && transfer.status !== statusFilter) return false
      if (fromBranchFilter !== 'ALL' && transfer.fromBranchId !== fromBranchFilter) return false
      if (toBranchFilter !== 'ALL' && transfer.toBranchId !== toBranchFilter) return false
      if (fromDate && transfer.transferDate && transfer.transferDate < fromDate) return false
      if (toDate && transfer.transferDate && transfer.transferDate > toDate) return false
      if (directionFilter === 'OUTGOING' && transfer.fromBranchId !== branchId) return false
      if (directionFilter === 'INCOMING' && transfer.toBranchId !== branchId) return false
      return true
    })
  }, [transfers, statusFilter, fromBranchFilter, toBranchFilter, fromDate, toDate, directionFilter, branchId])

  const totalPages = Math.max(1, Math.ceil(filteredTransfers.length / size))
  const pagedTransfers = useMemo(
    () => filteredTransfers.slice(page * size, page * size + size),
    [filteredTransfers, page, size],
  )

  const counts = useMemo(() => {
    const outgoing = transfers.filter((t) => t.fromBranchId === branchId).length
    const incoming = transfers.filter((t) => t.toBranchId === branchId).length
    return { outgoing, incoming }
  }, [transfers, branchId])

  const resetCreateForm = () => {
    setCreateForm({
      fromBranchId: branchId ?? '',
      toBranchId: '',
      transferDate: todayIsoDate(),
      notes: '',
      items: [{ productId: '', requestedQuantity: '1', notes: '' }],
    })
    setCreateError(null)
  }

  const openCreateModal = () => {
    resetCreateForm()
    setCreateModalOpen(true)
  }

  const closeCreateModal = () => {
    if (createSubmitting) return
    setCreateModalOpen(false)
  }

  const updateDraftItem = (index: number, patch: Partial<TransferItemDraft>) => {
    setCreateForm((prev) => ({
      ...prev,
      items: prev.items.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    }))
  }

  const addDraftItem = () => {
    setCreateForm((prev) => ({
      ...prev,
      items: [...prev.items, { productId: '', requestedQuantity: '1', notes: '' }],
    }))
  }

  const removeDraftItem = (index: number) => {
    setCreateForm((prev) => {
      if (prev.items.length === 1) return prev
      return { ...prev, items: prev.items.filter((_, idx) => idx !== index) }
    })
  }

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateError(null)

    if (!createForm.fromBranchId) {
      setCreateError('Source branch is required.')
      pushToast('error', 'Source branch is required.')
      return
    }
    if (!createForm.toBranchId) {
      setCreateError('Destination branch is required.')
      pushToast('error', 'Destination branch is required.')
      return
    }
    if (createForm.fromBranchId === createForm.toBranchId) {
      setCreateError('Source and destination branches must differ.')
      pushToast('error', 'Source and destination branches must differ.')
      return
    }

    const parsedItems: { productId: string; requestedQuantity: number; notes?: string }[] = []
    for (let i = 0; i < createForm.items.length; i += 1) {
      const row = createForm.items[i]
      if (!row.productId) {
        setCreateError(`Select product on line ${i + 1}.`)
        pushToast('error', `Select product on line ${i + 1}.`)
        return
      }
      const qty = Number(row.requestedQuantity)
      if (!Number.isFinite(qty) || qty <= 0) {
        setCreateError(`Quantity must be > 0 on line ${i + 1}.`)
        pushToast('error', `Quantity must be > 0 on line ${i + 1}.`)
        return
      }
      parsedItems.push({
        productId: row.productId,
        requestedQuantity: qty,
        notes: row.notes.trim() || undefined,
      })
    }

    setCreateSubmitting(true)
    try {
      await createTransfer({
        fromBranchId: createForm.fromBranchId,
        toBranchId: createForm.toBranchId,
        transferDate: createForm.transferDate || undefined,
        notes: createForm.notes.trim() || undefined,
        items: parsedItems,
      })
      setCreateModalOpen(false)
      setRefreshKey((v) => v + 1)
      pushToast('success', 'Transfer created successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create transfer'
      setCreateError(message)
      pushToast('error', message)
    } finally {
      setCreateSubmitting(false)
    }
  }

  const openDetail = async (transferId: string) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailError(null)
    setDetailTransfer(null)
    setReceiveQuantities({})
    setReceiveNotes('')
    try {
      const transfer = await fetchTransfer(transferId)
      setDetailTransfer(transfer)
      const initial: Record<string, string> = {}
      transfer.items.forEach((item) => {
        initial[item.productId] = String(item.sentQuantity ?? item.requestedQuantity ?? 0)
      })
      setReceiveQuantities(initial)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load transfer'
      setDetailError(message)
      pushToast('error', message)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    if (workflowSubmitting) return
    setDetailOpen(false)
    setDetailTransfer(null)
  }

  const runWorkflow = async (action: 'approve' | 'ship' | 'receive' | 'cancel') => {
    if (!detailTransfer) return
    setWorkflowSubmitting(true)
    try {
      let updated: TransferResponse
      if (action === 'approve') {
        updated = await approveTransfer(detailTransfer.id)
      } else if (action === 'ship') {
        updated = await shipTransfer(detailTransfer.id)
      } else if (action === 'cancel') {
        updated = await cancelTransfer(detailTransfer.id)
      } else {
        const items: ReceiveTransferItemRequest[] = detailTransfer.items.map((item) => {
          const raw = receiveQuantities[item.productId] ?? '0'
          const qty = Number(raw)
          return {
            productId: item.productId,
            receivedQuantity: Number.isFinite(qty) && qty >= 0 ? qty : 0,
          }
        })
        updated = await receiveTransfer(detailTransfer.id, {
          items,
          notes: receiveNotes.trim() || undefined,
        })
      }
      setDetailTransfer(updated)
      setRefreshKey((v) => v + 1)
      pushToast(
        'success',
        action === 'approve'
          ? 'Transfer approved.'
          : action === 'ship'
            ? 'Transfer shipped.'
            : action === 'receive'
              ? 'Transfer received.'
              : 'Transfer canceled.',
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Workflow action failed'
      pushToast('error', message)
    } finally {
      setWorkflowSubmitting(false)
    }
  }

  if (!branchId || !businessId) {
    return (
      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">Select a business and branch context to view transfers.</p>
      </section>
    )
  }

  const isOutgoing = detailTransfer?.fromBranchId === branchId
  const isIncoming = detailTransfer?.toBranchId === branchId
  const canApprove = detailTransfer?.status === 'DRAFT' && isOutgoing
  const canShip = detailTransfer?.status === 'PENDING' && isOutgoing
  const canReceive = detailTransfer?.status === 'IN_TRANSIT' && isIncoming
  const canCancel =
    detailTransfer != null && detailTransfer.status !== 'RECEIVED' && detailTransfer.status !== 'CANCELED'

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">All Transfers</p>
          <p className="mt-1 font-display text-2xl text-slate-900">{transfers.length}</p>
        </article>
        <article className="rounded-2xl border border-sky-100 bg-sky-50 p-4 shadow-sm">
          <p className="text-sm text-sky-800">Outgoing</p>
          <p className="mt-1 font-display text-2xl text-sky-900">{counts.outgoing}</p>
        </article>
        <article className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
          <p className="text-sm text-emerald-800">Incoming</p>
          <p className="mt-1 font-display text-2xl text-emerald-900">{counts.incoming}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-xl text-slate-900">Branch Transfers</h2>
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            New Transfer
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {(['ALL', 'OUTGOING', 'INCOMING'] as DirectionFilter[]).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => {
                setDirectionFilter(filter)
                setPage(0)
              }}
              className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                directionFilter === filter
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {filter === 'ALL' ? 'All' : filter === 'OUTGOING' ? 'Outgoing' : 'Incoming'}
            </button>
          ))}
        </div>

        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-6">
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as 'ALL' | TransferStatus)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="PENDING">PENDING</option>
            <option value="IN_TRANSIT">IN_TRANSIT</option>
            <option value="RECEIVED">RECEIVED</option>
            <option value="CANCELED">CANCELED</option>
          </select>
          <select
            value={fromBranchFilter}
            onChange={(event) => {
              setFromBranchFilter(event.target.value)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="ALL">From: All</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                From: {branch.name}
              </option>
            ))}
          </select>
          <select
            value={toBranchFilter}
            onChange={(event) => {
              setToBranchFilter(event.target.value)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="ALL">To: All</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                To: {branch.name}
              </option>
            ))}
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
        </div>

        {loading ? <p className="text-sm text-slate-500">Loading transfers...</p> : null}
        {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

        {!loading && !error ? (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">From</th>
                    <th className="px-2 py-2 font-medium">To</th>
                    <th className="px-2 py-2 font-medium">Items</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Direction</th>
                    <th className="px-2 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTransfers.map((transfer) => {
                    const direction =
                      transfer.fromBranchId === branchId
                        ? 'Outgoing'
                        : transfer.toBranchId === branchId
                          ? 'Incoming'
                          : '-'
                    return (
                      <tr key={transfer.id} className="border-b border-slate-100">
                        <td className="px-2 py-3 font-semibold text-slate-800">{formatDate(transfer.transferDate)}</td>
                        <td className="px-2 py-3 text-slate-700">{branchName(transfer.fromBranchId)}</td>
                        <td className="px-2 py-3 text-slate-700">{branchName(transfer.toBranchId)}</td>
                        <td className="px-2 py-3 text-slate-700">{transfer.items.length}</td>
                        <td className="px-2 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(transfer.status)}`}>
                            {transfer.status}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-slate-600">{direction}</td>
                        <td className="px-2 py-3">
                          <button
                            type="button"
                            onClick={() => void openDetail(transfer.id)}
                            className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {pagedTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-2 py-6 text-center text-slate-500">
                        No transfers match the filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-sm">
              <p className="text-slate-600">
                Total: {filteredTransfers.length} | Page {filteredTransfers.length === 0 ? 0 : page + 1} of {totalPages}
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
        <Modal title="Create Transfer" onClose={closeCreateModal} maxWidthClass="max-w-3xl">
          <form className="space-y-4" onSubmit={submitCreate}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <select
                value={createForm.fromBranchId}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, fromBranchId: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select source branch *</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    From: {branch.name}
                  </option>
                ))}
              </select>
              <select
                value={createForm.toBranchId}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, toBranchId: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select destination branch *</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    To: {branch.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={createForm.transferDate}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, transferDate: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <textarea
              value={createForm.notes}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={2}
              placeholder="Notes (optional)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />

            <div className="rounded-lg border border-slate-200">
              <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                <div className="col-span-6">Product</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-3">Notes</div>
                <div className="col-span-1 text-right">Action</div>
              </div>
              <div className="space-y-2 p-3">
                {createForm.items.map((item, index) => (
                  <div key={`transfer-item-${index}`} className="grid grid-cols-12 gap-2">
                    <select
                      value={item.productId}
                      onChange={(event) => updateDraftItem(index, { productId: event.target.value })}
                      className="col-span-6 rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    >
                      <option value="">Select product</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                          {product.sku ? ` · ${product.sku}` : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={item.requestedQuantity}
                      onChange={(event) => updateDraftItem(index, { requestedQuantity: event.target.value })}
                      className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    />
                    <input
                      value={item.notes}
                      onChange={(event) => updateDraftItem(index, { notes: event.target.value })}
                      placeholder="Notes"
                      className="col-span-3 rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeDraftItem(index)}
                      disabled={createForm.items.length === 1}
                      className="col-span-1 rounded-lg border border-rose-200 px-2 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      Del
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addDraftItem}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Add Line
                </button>
              </div>
            </div>

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
                {createSubmitting ? 'Creating...' : 'Create Transfer'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {detailOpen ? (
        <Modal
          title={detailTransfer ? `Transfer · ${formatDate(detailTransfer.transferDate)}` : 'Transfer'}
          onClose={closeDetail}
          maxWidthClass="max-w-5xl"
        >
          {detailLoading ? <p className="text-sm text-slate-500">Loading transfer...</p> : null}
          {detailError ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{detailError}</p>
          ) : null}
          {detailTransfer ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <article className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(detailTransfer.status)}`}>
                    {detailTransfer.status}
                  </span>
                </article>
                <article className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">From</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{branchName(detailTransfer.fromBranchId)}</p>
                </article>
                <article className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">To</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{branchName(detailTransfer.toBranchId)}</p>
                </article>
                <article className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Direction</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {isOutgoing ? 'Outgoing' : isIncoming ? 'Incoming' : '-'}
                  </p>
                </article>
              </div>

              {detailTransfer.notes ? (
                <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Notes: {detailTransfer.notes}
                </p>
              ) : null}

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Product</th>
                      <th className="px-2 py-2 font-medium">Requested</th>
                      <th className="px-2 py-2 font-medium">Sent</th>
                      <th className="px-2 py-2 font-medium">Received</th>
                      {canReceive ? <th className="px-2 py-2 font-medium">Receive Qty</th> : null}
                      <th className="px-2 py-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailTransfer.items.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-2 py-3 font-medium text-slate-800">{item.productName ?? '-'}</td>
                        <td className="px-2 py-3 text-slate-700">{Number(item.requestedQuantity ?? 0).toFixed(2)}</td>
                        <td className="px-2 py-3 text-slate-700">{Number(item.sentQuantity ?? 0).toFixed(2)}</td>
                        <td className="px-2 py-3 text-slate-700">{Number(item.receivedQuantity ?? 0).toFixed(2)}</td>
                        {canReceive ? (
                          <td className="px-2 py-3">
                            <input
                              type="number"
                              min="0"
                              step="0.0001"
                              value={receiveQuantities[item.productId] ?? '0'}
                              onChange={(event) =>
                                setReceiveQuantities((prev) => ({
                                  ...prev,
                                  [item.productId]: event.target.value,
                                }))
                              }
                              className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                            />
                          </td>
                        ) : null}
                        <td className="px-2 py-3 text-slate-600">{item.notes ?? '-'}</td>
                      </tr>
                    ))}
                    {detailTransfer.items.length === 0 ? (
                      <tr>
                        <td colSpan={canReceive ? 6 : 5} className="px-2 py-6 text-center text-slate-500">
                          No items on this transfer.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {canReceive ? (
                <textarea
                  value={receiveNotes}
                  onChange={(event) => setReceiveNotes(event.target.value)}
                  rows={2}
                  placeholder="Receive notes (optional)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void runWorkflow('cancel')}
                  disabled={workflowSubmitting || !canCancel}
                  className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void runWorkflow('approve')}
                  disabled={workflowSubmitting || !canApprove}
                  className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => void runWorkflow('ship')}
                  disabled={workflowSubmitting || !canShip}
                  className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-40"
                >
                  Ship
                </button>
                <button
                  type="button"
                  onClick={() => void runWorkflow('receive')}
                  disabled={workflowSubmitting || !canReceive}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {workflowSubmitting ? 'Working...' : 'Receive'}
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  )
}
