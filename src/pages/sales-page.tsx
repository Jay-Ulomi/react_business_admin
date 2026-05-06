import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBusinessContext } from '../features/context/business-context'
import {
  fetchSale,
  fetchSaleReceipt,
  fetchSalesPage,
  voidSale,
  type ReceiptResponse,
  type SaleResponse,
  type SaleStatus,
} from '../features/dashboard/dashboard-api'
import { ConfirmModal, type ConfirmState } from '../features/ui/confirm-modal'
import { useToast } from '../features/ui/toast-context'
import { formatCurrency } from '../lib/format'

type StatusFilter = 'ALL' | 'COMPLETED' | 'VOIDED' | 'SUSPENDED'

function toInstantStart(date: string): string | undefined {
  if (!date) return undefined
  return new Date(`${date}T00:00:00`).toISOString()
}

function toInstantEnd(date: string): string | undefined {
  if (!date) return undefined
  return new Date(`${date}T23:59:59.999`).toISOString()
}

function toStatusLabel(status: string): string {
  if (status === 'COMPLETED') return 'Completed'
  if (status === 'VOIDED') return 'Voided'
  if (status === 'SUSPENDED') return 'Suspended'
  return status
}

function toBadgeClass(status: string): string {
  if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-800'
  if (status === 'VOIDED') return 'bg-rose-100 text-rose-800'
  if (status === 'SUSPENDED') return 'bg-amber-100 text-amber-800'
  return 'bg-slate-100 text-slate-700'
}

function formatDateTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

export function SalesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { selectedContext } = useBusinessContext()
  const { pushToast } = useToast()

  const [sales, setSales] = useState<SaleResponse[]>([])
  const [totalElements, setTotalElements] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [page, setPage] = useState(Number(searchParams.get('page') ?? 0))
  const [size, setSize] = useState(Number(searchParams.get('size') ?? 20))
  const [status, setStatus] = useState<StatusFilter>((searchParams.get('status') as StatusFilter) || 'ALL')
  const [fromDate, setFromDate] = useState(searchParams.get('from') ?? '')
  const [toDate, setToDate] = useState(searchParams.get('to') ?? '')
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [saleDetail, setSaleDetail] = useState<SaleResponse | null>(null)
  const [receiptDetail, setReceiptDetail] = useState<ReceiptResponse | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  useEffect(() => {
    const next = new URLSearchParams()
    if (status !== 'ALL') next.set('status', status)
    if (fromDate) next.set('from', fromDate)
    if (toDate) next.set('to', toDate)
    if (query.trim()) next.set('q', query.trim())
    if (page !== 0) next.set('page', String(page))
    if (size !== 20) next.set('size', String(size))
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [fromDate, page, query, searchParams, setSearchParams, size, status, toDate])

  useEffect(() => {
    const branchId = selectedContext?.branchId
    if (!branchId) {
      setSales([])
      setTotalElements(0)
      setTotalPages(1)
      return
    }
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const pageData = await fetchSalesPage({
          branchId,
          status: status as SaleStatus,
          fromDate: toInstantStart(fromDate),
          toDate: toInstantEnd(toDate),
          page,
          size,
        })
        if (cancelled) return
        setSales(pageData.content ?? [])
        setTotalElements(pageData.totalElements ?? 0)
        setTotalPages(Math.max(1, pageData.totalPages ?? 1))
      } catch (err) {
        if (!cancelled) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to load sales')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [fromDate, page, reloadTick, selectedContext?.branchId, size, status, toDate])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sales
    return sales.filter((sale) => {
      const number = (sale.saleNumber || '').toLowerCase()
      const idPrefix = (sale.id || '').slice(0, 8).toLowerCase()
      return number.includes(q) || idPrefix.includes(q)
    })
  }, [query, sales])

  const openSaleDetail = async (saleId: string) => {
    setActionLoading(`detail:${saleId}`)
    try {
      const data = await fetchSale(saleId)
      setSaleDetail(data)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to load sale details')
    } finally {
      setActionLoading(null)
    }
  }

  const openReceipt = async (saleId: string) => {
    setActionLoading(`receipt:${saleId}`)
    try {
      const data = await fetchSaleReceipt(saleId)
      setReceiptDetail(data)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to load receipt')
    } finally {
      setActionLoading(null)
    }
  }

  const handleVoid = (saleId: string, saleNumber: string) => {
    setConfirmState({
      title: 'Void sale',
      message: `Void sale ${saleNumber}?`,
      confirmLabel: 'Void',
      destructive: true,
      onConfirm: async () => {
        setConfirmState(null)
        setActionLoading(`void:${saleId}`)
        try {
          await voidSale(saleId)
          pushToast('success', `Sale ${saleNumber} voided.`)
          setReloadTick((prev) => prev + 1)
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to void sale')
        } finally {
          setActionLoading(null)
        }
      },
    })
  }

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Sales</p>
            <h2 className="font-display text-xl text-slate-900">Sales Transactions</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            Total: {totalElements}
          </span>
        </div>

        {!selectedContext?.branchId ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Select business and branch context to view sales.
          </p>
        ) : null}

        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sale number"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
          />
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as StatusFilter)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="ALL">All Status</option>
            <option value="COMPLETED">Completed</option>
            <option value="VOIDED">Voided</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            title="From date"
          />
          <input
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            title="To date"
          />
        </div>

        {loading ? <p className="text-sm text-slate-500">Loading sales...</p> : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-2 py-2 font-medium">Sale #</th>
                <th className="px-2 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">Items</th>
                <th className="px-2 py-2 font-medium">Payments</th>
                <th className="px-2 py-2 font-medium">Total</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((sale) => (
                  <tr key={sale.id} className="border-b border-slate-100">
                    <td className="px-2 py-3 font-semibold text-slate-800">{sale.saleNumber}</td>
                    <td className="px-2 py-3 text-slate-700">{formatDateTime(sale.saleDate)}</td>
                    <td className="px-2 py-3 text-slate-700">{sale.items?.length ?? 0}</td>
                    <td className="px-2 py-3 text-slate-700">{sale.payments?.length ?? 0}</td>
                    <td className="px-2 py-3 text-slate-700">{formatCurrency(sale.totalAmount)}</td>
                    <td className="px-2 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${toBadgeClass(sale.status)}`}>
                        {toStatusLabel(sale.status)}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void openSaleDetail(sale.id)}
                          disabled={actionLoading !== null}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => void openReceipt(sale.id)}
                          disabled={actionLoading !== null}
                          className="rounded-lg border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                        >
                          Receipt
                        </button>
                        {sale.status !== 'VOIDED' ? (
                          <button
                            type="button"
                            onClick={() => handleVoid(sale.id, sale.saleNumber)}
                            disabled={actionLoading !== null}
                            className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                          >
                            Void
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center text-sm text-slate-500">
                    No sales found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Rows</span>
            <select
              value={size}
              onChange={(event) => {
                setSize(Number(event.target.value))
                setPage(0)
              }}
              className="rounded-lg border border-slate-200 px-2 py-1"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(0, prev - 1))}
              disabled={page <= 0}
              className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Prev
            </button>
            <span className="text-slate-600">
              Page {page + 1} / {totalPages}
            </span>
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
      </article>

      {saleDetail ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-emerald-100 bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-xl text-slate-900">Sale {saleDetail.saleNumber}</h3>
              <button
                type="button"
                onClick={() => setSaleDetail(null)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="mb-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-4">
              <p className="text-slate-700">Date: {formatDateTime(saleDetail.saleDate)}</p>
              <p className="text-slate-700">Status: {toStatusLabel(saleDetail.status)}</p>
              <p className="text-slate-700">Total: {formatCurrency(saleDetail.totalAmount)}</p>
              <p className="text-slate-700">Items: {saleDetail.items?.length ?? 0}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">Product</th>
                    <th className="px-2 py-2 font-medium">Qty</th>
                    <th className="px-2 py-2 font-medium">Unit Price</th>
                    <th className="px-2 py-2 font-medium">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(saleDetail.items ?? []).map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="px-2 py-2 text-slate-800">{item.productName}</td>
                      <td className="px-2 py-2 text-slate-700">{item.quantity}</td>
                      <td className="px-2 py-2 text-slate-700">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-2 py-2 text-slate-700">{formatCurrency(item.lineTotal)}</td>
                    </tr>
                  ))}
                  {!(saleDetail.items ?? []).length ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-4 text-center text-sm text-slate-500">
                        No line items.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
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

      {receiptDetail ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-blue-100 bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-xl text-slate-900">Receipt {receiptDetail.saleNumber}</h3>
              <button
                type="button"
                onClick={() => setReceiptDetail(null)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="mb-3 text-sm text-slate-700">
              <p>{receiptDetail.businessName || '-'}</p>
              <p>{receiptDetail.branchName || '-'}</p>
              <p>{formatDateTime(receiptDetail.saleDate)}</p>
            </div>
            <div className="space-y-1 text-sm text-slate-700">
              <p>Subtotal: {formatCurrency(receiptDetail.subtotal)}</p>
              <p>Discount: {formatCurrency(receiptDetail.discountAmount)}</p>
              <p>Tax: {formatCurrency(receiptDetail.taxAmount)}</p>
              <p className="font-semibold">Total: {formatCurrency(receiptDetail.totalAmount)}</p>
              <p>Paid: {formatCurrency(receiptDetail.totalPaid)}</p>
              <p>Change: {formatCurrency(receiptDetail.changeAmount)}</p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
