import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBusinessContext } from '../features/context/business-context'
import {
  fetchMovements,
  fetchMovementSummary,
  type InventoryMovementResponse,
  type InventoryMovementSummaryResponse,
} from '../features/inventory/inventory-api'
import { useToast } from '../features/ui/toast-context'

type LaundryAuditRow = InventoryMovementResponse & {
  laundryAction: 'CREATE' | 'CANCEL' | 'OTHER'
  ticketNumber: string | null
}

type DatePreset = 'CUSTOM' | 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH'

function parseLaundryMeta(notes: string | undefined): { action: LaundryAuditRow['laundryAction']; ticketNumber: string | null } {
  const value = (notes ?? '').trim().toUpperCase()
  if (!value.startsWith('LAUNDRY_')) {
    return { action: 'OTHER', ticketNumber: null }
  }
  const [prefix, ticket] = value.split(':', 2)
  if (prefix === 'LAUNDRY_CREATE') {
    return { action: 'CREATE', ticketNumber: ticket?.trim() || null }
  }
  if (prefix === 'LAUNDRY_CANCEL') {
    return { action: 'CANCEL', ticketNumber: ticket?.trim() || null }
  }
  return { action: 'OTHER', ticketNumber: ticket?.trim() || null }
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatInputDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getPresetRange(preset: Exclude<DatePreset, 'CUSTOM'>): { from: string; to: string } {
  const now = new Date()
  if (preset === 'TODAY') {
    const day = formatInputDate(now)
    return { from: day, to: day }
  }
  if (preset === 'LAST_7_DAYS') {
    const from = new Date(now)
    from.setDate(now.getDate() - 6)
    return { from: formatInputDate(from), to: formatInputDate(now) }
  }
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: formatInputDate(first), to: formatInputDate(now) }
}

function toIsoFromDate(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString()
}

function toIsoToDate(date: string): string {
  return new Date(`${date}T23:59:59.999`).toISOString()
}

export function LaundryStockAuditPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { selectedContext } = useBusinessContext()
  const { pushToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<LaundryAuditRow[]>([])
  const [totalElements, setTotalElements] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [summary, setSummary] = useState<InventoryMovementSummaryResponse>({
    totalRows: 0,
    createdQuantity: 0,
    returnedQuantity: 0,
  })
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [fromDate, setFromDate] = useState(searchParams.get('from') ?? '')
  const [toDate, setToDate] = useState(searchParams.get('to') ?? '')
  const [preset, setPreset] = useState<DatePreset>(() => {
    const value = searchParams.get('preset')
    if (value === 'TODAY' || value === 'LAST_7_DAYS' || value === 'THIS_MONTH') return value
    return 'CUSTOM'
  })
  const [page, setPage] = useState(Math.max(0, Number(searchParams.get('page') ?? 0)))
  const [pageSize, setPageSize] = useState(() => {
    const parsed = Number(searchParams.get('size') ?? 20)
    return [10, 20, 50].includes(parsed) ? parsed : 20
  })

  useEffect(() => {
    const branchId = selectedContext?.branchId
    if (!branchId) {
      setRows([])
      setTotalElements(0)
      setTotalPages(1)
      setSummary({ totalRows: 0, createdQuantity: 0, returnedQuantity: 0 })
      setLoading(false)
      return
    }

    let cancelled = false

    const run = async () => {
      setLoading(true)
      try {
        const filter = {
          branchId,
          notesPrefix: 'LAUNDRY_',
          search: query.trim() || undefined,
          fromDate: fromDate ? toIsoFromDate(fromDate) : undefined,
          toDate: toDate ? toIsoToDate(toDate) : undefined,
        }
        const [result, summaryResult] = await Promise.all([
          fetchMovements({
            ...filter,
            page,
            size: pageSize,
          }),
          fetchMovementSummary(filter),
        ])
        if (cancelled) return

        const laundryRows = result.content
          .map((row) => {
            const parsed = parseLaundryMeta(row.notes)
            return {
              ...row,
              laundryAction: parsed.action,
              ticketNumber: parsed.ticketNumber,
            }
          })
          .filter((row) => row.laundryAction !== 'OTHER')

        setRows(laundryRows)
        setTotalElements(result.totalElements)
        setTotalPages(Math.max(1, result.totalPages))
        setSummary(summaryResult)
      } catch (err) {
        if (!cancelled) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to load laundry stock movements')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [fromDate, page, pageSize, pushToast, query, selectedContext?.branchId, toDate])

  useEffect(() => {
    const next = new URLSearchParams()
    if (query.trim()) next.set('q', query.trim())
    if (fromDate) next.set('from', fromDate)
    if (toDate) next.set('to', toDate)
    if (preset !== 'CUSTOM') next.set('preset', preset)
    if (page !== 0) next.set('page', String(page))
    if (pageSize !== 20) next.set('size', String(pageSize))
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [fromDate, page, pageSize, preset, query, searchParams, setSearchParams, toDate])

  const safePage = Math.min(page, totalPages - 1)

  if (!selectedContext?.branchId) {
    return (
      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">Select a business and branch context to view laundry stock audit.</p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Laundry</p>
        <h2 className="font-display text-xl text-slate-900">Stock Audit</h2>
        <p className="text-sm text-slate-500">Inventory movements generated from laundry tickets.</p>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Audit Rows</p>
          <p className="mt-1 font-display text-2xl text-slate-900">{summary.totalRows}</p>
        </article>
        <article className="rounded-2xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
          <p className="text-sm text-blue-700">Created Qty</p>
          <p className="mt-1 font-display text-2xl text-blue-900">{Number(summary.createdQuantity ?? 0).toFixed(2)}</p>
        </article>
        <article className="rounded-2xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
          <p className="text-sm text-amber-700">Returned Qty</p>
          <p className="mt-1 font-display text-2xl text-amber-900">{Number(summary.returnedQuantity ?? 0).toFixed(2)}</p>
        </article>
      </section>

      <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex w-full flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const range = getPresetRange('TODAY')
                  setPreset('TODAY')
                  setFromDate(range.from)
                  setToDate(range.to)
                  setPage(0)
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                  preset === 'TODAY'
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const range = getPresetRange('LAST_7_DAYS')
                  setPreset('LAST_7_DAYS')
                  setFromDate(range.from)
                  setToDate(range.to)
                  setPage(0)
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                  preset === 'LAST_7_DAYS'
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  const range = getPresetRange('THIS_MONTH')
                  setPreset('THIS_MONTH')
                  setFromDate(range.from)
                  setToDate(range.to)
                  setPage(0)
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                  preset === 'THIS_MONTH'
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreset('CUSTOM')
                  setFromDate('')
                  setToDate('')
                  setPage(0)
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                  preset === 'CUSTOM' && !fromDate && !toDate
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Clear
              </button>
            </div>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(0)
              }}
              placeholder="Search by ticket or product"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm md:max-w-sm"
            />
            <input
              type="date"
              value={fromDate}
              onChange={(event) => {
                setPreset('CUSTOM')
                setFromDate(event.target.value)
                setPage(0)
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={toDate}
              onChange={(event) => {
                setPreset('CUSTOM')
                setToDate(event.target.value)
                setPage(0)
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value))
                setPage(0)
              }}
              className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
            >
              <option value={10}>10 rows</option>
              <option value={20}>20 rows</option>
              <option value={50}>50 rows</option>
            </select>
          </div>
        </div>

        {loading ? <p className="text-sm text-slate-500">Loading stock audit...</p> : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-2 py-2 font-medium">Time</th>
                <th className="px-2 py-2 font-medium">Ticket</th>
                <th className="px-2 py-2 font-medium">Product</th>
                <th className="px-2 py-2 font-medium">Action</th>
                <th className="px-2 py-2 font-medium">Movement</th>
                <th className="px-2 py-2 font-medium">Before</th>
                <th className="px-2 py-2 font-medium">After</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-2 py-3 text-slate-700">{formatDateTime(row.createdAt)}</td>
                  <td className="px-2 py-3 font-medium text-slate-800">{row.ticketNumber ?? '-'}</td>
                  <td className="px-2 py-3 text-slate-700">{row.productName}</td>
                  <td className="px-2 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        row.laundryAction === 'CREATE'
                          ? 'bg-blue-100 text-blue-800'
                          : row.laundryAction === 'CANCEL'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {row.laundryAction}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-slate-700">
                    {row.movementType} {row.quantityChanged > 0 ? '+' : ''}
                    {row.quantityChanged}
                  </td>
                  <td className="px-2 py-3 text-slate-600">{row.quantityBefore}</td>
                  <td className="px-2 py-3 text-slate-600">{row.quantityAfter}</td>
                </tr>
              ))}
              {!loading && !rows.length ? (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center text-sm text-slate-500">
                    No laundry stock movements found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 text-sm">
          <p className="text-slate-600">
            Showing {rows.length} of {totalElements}
          </p>
          <div className="flex items-center gap-2">
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
    </section>
  )
}
