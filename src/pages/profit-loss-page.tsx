import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchProfitAndLoss,
  type ProfitAndLossReport,
} from '../features/accounting/reports-api'
import { useToast } from '../features/ui/toast-context'
import { formatCurrency } from '../lib/format'

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function monthStartIsoDate(): string {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

export function ProfitLossPage() {
  const { pushToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [startDate, setStartDate] = useState(searchParams.get('start') ?? monthStartIsoDate())
  const [endDate, setEndDate] = useState(searchParams.get('end') ?? todayIsoDate())
  const [report, setReport] = useState<ProfitAndLossReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const next = new URLSearchParams()
    if (startDate !== monthStartIsoDate()) next.set('start', startDate)
    if (endDate !== todayIsoDate()) next.set('end', endDate)
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [startDate, endDate, searchParams, setSearchParams])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const result = await fetchProfitAndLoss(startDate, endDate)
        if (!cancelled) setReport(result)
      } catch (err) {
        if (!cancelled)
          pushToast('error', err instanceof Error ? err.message : 'Failed to load profit & loss')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [startDate, endDate, pushToast])

  const formatSigned = (value: number | undefined) => {
    const n = Number(value ?? 0)
    if (n < 0) {
      return <span className="text-rose-600">({formatCurrency(Math.abs(n))})</span>
    }
    return <span>{formatCurrency(n)}</span>
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Accounting</p>
          <h2 className="font-display text-xl text-slate-900">Profit &amp; Loss</h2>
          <p className="text-sm text-slate-500">Revenue, expenses, and net income</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading report...</p> : null}

      {!loading && report ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-800">Revenue</p>
              <p className="font-display text-2xl text-emerald-900">
                {formatCurrency(report.totalRevenue)}
              </p>
            </article>
            <article className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-800">COGS</p>
              <p className="font-display text-2xl text-amber-900">
                {formatCurrency(report.costOfGoodsSold)}
              </p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-600">Expenses</p>
              <p className="font-display text-2xl text-slate-900">
                {formatCurrency(report.totalExpenses)}
              </p>
            </article>
            <article
              className={`rounded-xl border p-3 ${
                Number(report.netProfit) >= 0
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-rose-200 bg-rose-50'
              }`}
            >
              <p className="text-xs text-slate-600">Net Profit</p>
              <p className="font-display text-2xl">{formatSigned(report.netProfit)}</p>
            </article>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">Revenue</th>
                    <th className="px-2 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.revenueItems.map((item, index) => (
                    <tr key={`r-${item.name}-${index}`} className="border-b border-slate-100">
                      <td className="px-2 py-2 text-slate-700">{item.name}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-800">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                  {report.revenueItems.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-2 py-4 text-center text-sm text-slate-500">
                        No revenue items.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot className="border-t border-slate-200 font-semibold text-slate-800">
                  <tr>
                    <td className="px-2 py-2">Total Revenue</td>
                    <td className="px-2 py-2 text-right font-mono">
                      {formatCurrency(report.totalRevenue)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2 py-2">Gross Profit</td>
                    <td className="px-2 py-2 text-right font-mono">
                      {formatCurrency(report.grossProfit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">Expenses</th>
                    <th className="px-2 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.expenseItems.map((item, index) => (
                    <tr key={`e-${item.name}-${index}`} className="border-b border-slate-100">
                      <td className="px-2 py-2 text-slate-700">{item.name}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-800">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                  {report.expenseItems.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-2 py-4 text-center text-sm text-slate-500">
                        No expense items.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot className="border-t border-slate-200 font-semibold text-slate-800">
                  <tr>
                    <td className="px-2 py-2">Total Expenses</td>
                    <td className="px-2 py-2 text-right font-mono">
                      {formatCurrency(report.totalExpenses)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2 py-2">Net Profit</td>
                    <td className="px-2 py-2 text-right font-mono">{formatSigned(report.netProfit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
