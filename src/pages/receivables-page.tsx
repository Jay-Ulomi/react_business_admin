import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchReceivables,
  fetchOverdueReceivables,
  type ReceivableResponse,
} from '../features/accounting/receivables-api'
import { fetchCustomers, type CustomerResponse } from '../features/customers/customers-api'
import { useToast } from '../features/ui/toast-context'
import { formatCurrency } from '../lib/format'

// ── Aging ─────────────────────────────────────────────────────────────────────

type AgingBuckets = {
  current: number
  d1to30: number
  d31to60: number
  d61to90: number
  d90plus: number
}

function daysBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
}

function computeAging(receivables: ReceivableResponse[]): AgingBuckets {
  const now = new Date()
  const buckets: AgingBuckets = { current: 0, d1to30: 0, d31to60: 0, d61to90: 0, d90plus: 0 }
  for (const r of receivables) {
    const balance = Number(r.balance ?? 0)
    if (balance <= 0) continue
    const overdueDays = daysBetween(new Date(r.dueDate), now)
    if (overdueDays <= 0) buckets.current += balance
    else if (overdueDays <= 30) buckets.d1to30 += balance
    else if (overdueDays <= 60) buckets.d31to60 += balance
    else if (overdueDays <= 90) buckets.d61to90 += balance
    else buckets.d90plus += balance
  }
  return buckets
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PAID:    'bg-emerald-100 text-emerald-800',
    OVERDUE: 'bg-rose-100 text-rose-700',
    PARTIAL: 'bg-amber-100 text-amber-800',
    OPEN:    'bg-sky-100 text-sky-800',
  }
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ReceivablesPage() {
  const { pushToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [receivables, setReceivables] = useState<ReceivableResponse[]>([])
  const [overdue, setOverdue] = useState<ReceivableResponse[]>([])
  const [customers, setCustomers] = useState<CustomerResponse[]>([])
  const [customerFilter, setCustomerFilter] = useState(searchParams.get('customerId') ?? '')
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '0') || 0)
  const [size, setSize] = useState(Number(searchParams.get('size') ?? '20') || 20)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshKey] = useState(0)

  // Sync filters to URL
  useEffect(() => {
    const next = new URLSearchParams()
    if (customerFilter) next.set('customerId', customerFilter)
    if (page !== 0) next.set('page', String(page))
    if (size !== 20) next.set('size', String(size))
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [customerFilter, page, size, searchParams, setSearchParams])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const [receivablesPage, overdueList, customersPage] = await Promise.all([
          fetchReceivables({ customerId: customerFilter || undefined, page, size }),
          fetchOverdueReceivables().catch(() => [] as ReceivableResponse[]),
          fetchCustomers({ isActive: true, page: 0, size: 500, sortBy: 'name', sortDir: 'asc' }),
        ])
        if (cancelled) return
        setReceivables(receivablesPage.content)
        setTotalPages(receivablesPage.totalPages)
        setTotalElements(receivablesPage.totalElements)
        setOverdue(overdueList)
        setCustomers(customersPage.content)
      } catch (err) {
        if (!cancelled)
          pushToast('error', err instanceof Error ? err.message : 'Failed to load receivables')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [customerFilter, page, size, refreshKey, pushToast])

  const aging = useMemo(() => computeAging(receivables), [receivables])
  const customerMap = useMemo(() => {
    const map = new Map<string, string>()
    customers.forEach((c) => map.set(c.id, c.name))
    return map
  }, [customers])

  const customerName = (id: string) => customerMap.get(id) ?? id.slice(0, 8) + '…'

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Accounting</p>
          <h2 className="font-display text-xl text-slate-900">Customer Receivables</h2>
          <p className="text-sm text-slate-500">
            Total: {totalElements} | Overdue: {overdue.length}
          </p>
        </div>
      </div>

      {/* Aging buckets */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-800">Current</p>
          <p className="font-display text-lg text-emerald-900">{formatCurrency(aging.current)}</p>
        </article>
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">1–30 days</p>
          <p className="font-display text-lg text-amber-900">{formatCurrency(aging.d1to30)}</p>
        </article>
        <article className="rounded-xl border border-amber-300 bg-amber-100 p-3">
          <p className="text-xs text-amber-900">31–60 days</p>
          <p className="font-display text-lg text-amber-950">{formatCurrency(aging.d31to60)}</p>
        </article>
        <article className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs text-rose-700">61–90 days</p>
          <p className="font-display text-lg text-rose-800">{formatCurrency(aging.d61to90)}</p>
        </article>
        <article className="rounded-xl border border-rose-300 bg-rose-100 p-3">
          <p className="text-xs text-rose-800">90+ days</p>
          <p className="font-display text-lg text-rose-900">{formatCurrency(aging.d90plus)}</p>
        </article>
      </div>

      {/* Filters */}
      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        <select
          aria-label="Filter by customer"
          value={customerFilter}
          onChange={(e) => { setCustomerFilter(e.target.value); setPage(0) }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">All customers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          aria-label="Rows per page"
          value={size}
          onChange={(e) => { setSize(Number(e.target.value)); setPage(0) }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value={10}>10 rows</option>
          <option value={20}>20 rows</option>
          <option value={50}>50 rows</option>
        </select>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading receivables...</p> : null}

      {!loading ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Customer</th>
                  <th className="px-2 py-2 font-medium">Sale</th>
                  <th className="px-2 py-2 font-medium">Due Date</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                  <th className="px-2 py-2 text-right font-medium">Paid</th>
                  <th className="px-2 py-2 text-right font-medium">Balance</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {receivables.map((r) => {
                  const balance = Number(r.balance ?? 0)
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-slate-100 ${r.status === 'OVERDUE' ? 'bg-rose-50/40' : ''}`}
                    >
                      <td className="px-2 py-3 text-slate-700">{customerName(r.customerId)}</td>
                      <td className="px-2 py-3 font-mono text-xs text-slate-500">
                        {r.saleId.slice(0, 8)}…
                      </td>
                      <td className={`px-2 py-3 ${r.status === 'OVERDUE' ? 'font-semibold text-rose-600' : 'text-slate-700'}`}>
                        {r.dueDate}
                      </td>
                      <td className="px-2 py-3 text-right font-mono text-slate-800">
                        {formatCurrency(r.amount)}
                      </td>
                      <td className="px-2 py-3 text-right font-mono text-slate-800">
                        {formatCurrency(r.paidAmount)}
                      </td>
                      <td className={`px-2 py-3 text-right font-mono ${balance > 0 ? 'text-slate-800' : 'text-emerald-700'}`}>
                        {formatCurrency(balance)}
                      </td>
                      <td className="px-2 py-3">{statusBadge(r.status)}</td>
                    </tr>
                  )
                })}
                {receivables.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-6 text-center text-sm text-slate-500">
                      No receivables found.
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
    </section>
  )
}
