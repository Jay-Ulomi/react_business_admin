import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBusinessContext } from '../features/context/business-context'
import {
  fetchBranchPerformanceReport,
  fetchCashierSessions,
  fetchDailySalesReport,
  fetchLowStockReport,
  fetchSalesSummaryReport,
  type BranchPerformanceReport,
  type CashierSessionReport,
  type DailySalesReport,
  type LowStockReport,
  type SalesSummaryReport,
} from '../features/reports/reports-api'
import { useToast } from '../features/ui/toast-context'
import { formatCurrency } from '../lib/format'

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function weekAgoIsoDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

function monthStartIsoDate(): string {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

function exportCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const escape = (v: string | number | null | undefined): string => {
    const str = v == null ? '' : String(v)
    return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str
  }
  const lines = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))]
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { selectedContext } = useBusinessContext()
  const { pushToast } = useToast()
  const [date, setDate] = useState(searchParams.get('date') ?? todayIsoDate())
  const [startDate, setStartDate] = useState(searchParams.get('start') ?? weekAgoIsoDate())
  const [endDate, setEndDate] = useState(searchParams.get('end') ?? todayIsoDate())
  const [dailySales, setDailySales] = useState<DailySalesReport | null>(null)
  const [lowStockReport, setLowStockReport] = useState<LowStockReport | null>(null)
  const [salesSummary, setSalesSummary] = useState<SalesSummaryReport | null>(null)
  const [branchPerformance, setBranchPerformance] = useState<BranchPerformanceReport | null>(null)
  const [cashierSessions, setCashierSessions] = useState<CashierSessionReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const next = new URLSearchParams()
    if (date !== todayIsoDate()) next.set('date', date)
    if (startDate !== weekAgoIsoDate()) next.set('start', startDate)
    if (endDate !== todayIsoDate()) next.set('end', endDate)
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [date, endDate, searchParams, setSearchParams, startDate])

  const applyRangePreset = (preset: 'today' | 'last7' | 'month') => {
    const today = todayIsoDate()
    if (preset === 'today') {
      setDate(today)
      setStartDate(today)
      setEndDate(today)
    } else if (preset === 'last7') {
      setDate(today)
      setStartDate(weekAgoIsoDate())
      setEndDate(today)
    } else {
      setDate(today)
      setStartDate(monthStartIsoDate())
      setEndDate(today)
    }
  }

  useEffect(() => {
    const branchId = selectedContext?.branchId
    if (!branchId) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const [daily, low, summary, performance, sessions] = await Promise.all([
          fetchDailySalesReport(branchId, date),
          fetchLowStockReport(branchId),
          fetchSalesSummaryReport(startDate, endDate),
          fetchBranchPerformanceReport(startDate, endDate),
          fetchCashierSessions(branchId, startDate, endDate).catch(() => [] as CashierSessionReport[]),
        ])
        if (cancelled) return
        setDailySales(daily)
        setLowStockReport(low)
        setSalesSummary(summary)
        setBranchPerformance(performance)
        setCashierSessions(sessions)
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load reports'
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
  }, [date, endDate, selectedContext?.branchId, startDate])

  const topLowStock = useMemo(() => lowStockReport?.items?.slice(0, 6) ?? [], [lowStockReport?.items])

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => applyRangePreset('today')}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => applyRangePreset('last7')}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => applyRangePreset('month')}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            This Month
          </button>
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Branch Reporting</p>
            <h2 className="font-display text-xl text-slate-900">Daily Sales and Low Stock</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          {dailySales ? (
            <button
              type="button"
              onClick={() =>
                exportCsv(`daily-sales-${date}.csv`, ['Metric', 'Value'], [
                  ['Transactions', dailySales.totalTransactions],
                  ['Completed', dailySales.completedTransactions],
                  ['Voided', dailySales.voidedTransactions],
                  ['Total Sales', dailySales.totalSales],
                  ['Total Returns', dailySales.totalReturns],
                  ['Net Sales', dailySales.netSales],
                  ['Total Tax', dailySales.totalTax],
                  ['Total Discount', dailySales.totalDiscount],
                  ...Object.entries(dailySales.paymentMethodTotals ?? {}).map(([m, a]) => [
                    `Payment - ${m.replace(/_/g, ' ')}`,
                    a,
                  ]),
                ])
              }
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </button>
          ) : null}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              title="Daily report date"
            />
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              title="Range start date"
            />
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              title="Range end date"
            />
          </div>
          </div>
        </div>

        {loading ? <p className="text-sm text-slate-500">Loading reports...</p> : null}
        {!loading && !error && dailySales ? (
          <div className="space-y-4">
            {/* KPI strip */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                <p className="text-xs text-emerald-800">Transactions</p>
                <p className="font-display text-2xl text-emerald-900">{dailySales.totalTransactions}</p>
                {dailySales.voidedTransactions > 0 && (
                  <p className="text-xs text-slate-500">{dailySales.voidedTransactions} voided</p>
                )}
              </article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600">Total Sales</p>
                <p className="font-display text-2xl text-slate-900">{formatCurrency(dailySales.totalSales)}</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600">Net Sales</p>
                <p className="font-display text-2xl text-slate-900">{formatCurrency(dailySales.netSales)}</p>
                {dailySales.totalReturns > 0 && (
                  <p className="text-xs text-red-500">Returns: {formatCurrency(dailySales.totalReturns)}</p>
                )}
              </article>
              <article className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-800">Low Stock Items</p>
                <p className="font-display text-2xl text-amber-900">
                  {lowStockReport?.totalLowStockItems ?? 0}
                </p>
              </article>
            </div>

            {/* Payment method breakdown */}
            {dailySales.paymentMethodTotals && Object.keys(dailySales.paymentMethodTotals).length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Payment Methods</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {Object.entries(dailySales.paymentMethodTotals).map(([method, amount]) => (
                    <div key={method} className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
                      <p className="text-xs text-sky-700 capitalize">{method.replace(/_/g, ' ')}</p>
                      <p className="font-display text-lg text-sky-900">{formatCurrency(amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top products */}
            {dailySales.topProducts && dailySales.topProducts.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Top Products</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-slate-200 text-left text-slate-500">
                      <tr>
                        <th className="px-2 py-2 font-medium">Product</th>
                        <th className="px-2 py-2 font-medium text-right">Qty Sold</th>
                        <th className="px-2 py-2 font-medium text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailySales.topProducts.map((p) => (
                        <tr key={p.productId} className="border-b border-slate-100">
                          <td className="px-2 py-2 font-medium text-slate-800">{p.productName}</td>
                          <td className="px-2 py-2 text-right text-slate-700">{p.quantitySold}</td>
                          <td className="px-2 py-2 text-right text-slate-700">{formatCurrency(p.totalRevenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg text-slate-900">Sales Summary ({startDate} to {endDate})</h3>
          {salesSummary ? (
            <button
              type="button"
              onClick={() =>
                exportCsv(`sales-summary-${startDate}-${endDate}.csv`, ['Metric', 'Value'], [
                  ['Revenue', salesSummary.totalRevenue],
                  ['Expenses', salesSummary.totalExpenses],
                  ['Profit Estimate', salesSummary.profitEstimate],
                  ['Transactions', salesSummary.totalTransactions],
                ])
              }
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </button>
          ) : null}
        </div>
        {!loading && !error && salesSummary ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-600">Revenue</p>
              <p className="font-display text-2xl text-slate-900">{formatCurrency(salesSummary.totalRevenue)}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-600">Expenses</p>
              <p className="font-display text-2xl text-slate-900">{formatCurrency(salesSummary.totalExpenses)}</p>
            </article>
            <article className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-800">Profit Estimate</p>
              <p className="font-display text-2xl text-emerald-900">
                {formatCurrency(salesSummary.profitEstimate)}
              </p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-600">Transactions</p>
              <p className="font-display text-2xl text-slate-900">{salesSummary.totalTransactions}</p>
            </article>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg text-slate-900">Branch Performance ({startDate} to {endDate})</h3>
          {branchPerformance ? (
            <button
              type="button"
              onClick={() =>
                exportCsv(
                  `branch-performance-${startDate}-${endDate}.csv`,
                  ['Branch', 'Transactions', 'Sales', 'Expenses', 'Net Revenue'],
                  branchPerformance.branches.map((b) => [
                    b.branchName,
                    b.transactionCount,
                    b.totalSales,
                    b.totalExpenses,
                    b.netRevenue,
                  ]),
                )
              }
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </button>
          ) : null}
        </div>
        {!loading && !error && branchPerformance ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Branch</th>
                  <th className="px-2 py-2 font-medium">Transactions</th>
                  <th className="px-2 py-2 font-medium">Sales</th>
                  <th className="px-2 py-2 font-medium">Expenses</th>
                  <th className="px-2 py-2 font-medium">Net Revenue</th>
                </tr>
              </thead>
              <tbody>
                {branchPerformance.branches.map((branch) => (
                  <tr key={branch.branchId} className="border-b border-slate-100">
                    <td className="px-2 py-3 font-medium text-slate-800">{branch.branchName}</td>
                    <td className="px-2 py-3 text-slate-700">{branch.transactionCount}</td>
                    <td className="px-2 py-3 text-slate-700">{formatCurrency(branch.totalSales)}</td>
                    <td className="px-2 py-3 text-slate-700">{formatCurrency(branch.totalExpenses)}</td>
                    <td className="px-2 py-3 text-slate-700">{formatCurrency(branch.netRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg text-slate-900">Cashier Sessions ({startDate} to {endDate})</h3>
          {cashierSessions.length > 0 && (
            <button
              type="button"
              onClick={() =>
                exportCsv(
                  `cashier-sessions-${startDate}-${endDate}.csv`,
                  ['Session ID', 'Opened At', 'Closed At', 'Status', 'Sales', 'Voided', 'Total Revenue', 'Cash Diff'],
                  cashierSessions.map((s) => [
                    s.sessionId,
                    s.openedAt,
                    s.closedAt ?? '',
                    s.status,
                    s.completedSalesCount,
                    s.voidedSalesCount,
                    s.totalSalesAmount,
                    s.cashDifference,
                  ]),
                )
              }
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </button>
          )}
        </div>
        {!loading && cashierSessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Opened</th>
                  <th className="px-2 py-2 font-medium">Closed</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium text-right">Sales</th>
                  <th className="px-2 py-2 font-medium text-right">Voided</th>
                  <th className="px-2 py-2 font-medium text-right">Revenue</th>
                  <th className="px-2 py-2 font-medium text-right">Cash Diff</th>
                  <th className="px-2 py-2 font-medium">Payments</th>
                </tr>
              </thead>
              <tbody>
                {cashierSessions.map((s) => (
                  <tr key={s.sessionId} className="border-b border-slate-100">
                    <td className="px-2 py-2 text-slate-700">{new Date(s.openedAt).toLocaleString()}</td>
                    <td className="px-2 py-2 text-slate-700">{s.closedAt ? new Date(s.closedAt).toLocaleString() : '—'}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        s.status === 'CLOSED'
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-slate-700">{s.completedSalesCount}</td>
                    <td className="px-2 py-2 text-right text-slate-700">{s.voidedSalesCount}</td>
                    <td className="px-2 py-2 text-right font-semibold text-slate-800">{formatCurrency(s.totalSalesAmount)}</td>
                    <td className={`px-2 py-2 text-right font-semibold ${s.cashDifference < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {formatCurrency(s.cashDifference)}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-600">
                      {Object.entries(s.paymentBreakdown ?? {}).map(([m, a]) => (
                        <span key={m} className="mr-2 whitespace-nowrap capitalize">
                          {m.replace(/_/g, ' ')}: {formatCurrency(a)}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && <p className="text-sm text-slate-500">No cashier sessions for this period.</p>
        )}
      </section>

      <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg text-slate-900">Most Urgent Restocks</h3>
          {topLowStock.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                exportCsv(
                  `low-stock-${todayIsoDate()}.csv`,
                  ['Product', 'SKU', 'Current Stock', 'Min Level', 'Deficit'],
                  topLowStock.map((item) => [
                    item.productName,
                    item.sku,
                    item.currentStock,
                    item.minStockLevel,
                    item.deficit,
                  ]),
                )
              }
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </button>
          ) : null}
        </div>
        <div className="space-y-2">
          {topLowStock.map((item) => (
            <div key={item.productId} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-sm font-semibold text-slate-800">{item.productName}</p>
              <p className="text-xs text-slate-600">SKU: {item.sku || '-'}</p>
              <p className="text-xs text-amber-900">
                Current: {item.currentStock} | Min: {item.minStockLevel} | Deficit: {item.deficit}
              </p>
            </div>
          ))}
          {!topLowStock.length ? <p className="text-sm text-slate-500">No low stock records.</p> : null}
        </div>
      </section>
    </div>
  )
}
