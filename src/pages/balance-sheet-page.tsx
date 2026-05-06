import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchBalanceSheet,
  type BalanceSheetEntry,
  type BalanceSheetReport,
} from '../features/accounting/reports-api'
import { useToast } from '../features/ui/toast-context'
import { formatCurrency } from '../lib/format'

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function Section({
  title,
  items,
  total,
}: {
  title: string
  items: BalanceSheetEntry[]
  total: number
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-2 py-2 font-medium">{title}</th>
            <th className="px-2 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${title}-${item.name}-${index}`} className="border-b border-slate-100">
              <td className="px-2 py-2 text-slate-700">{item.name}</td>
              <td className="px-2 py-2 text-right font-mono text-slate-800">
                {formatCurrency(item.amount)}
              </td>
            </tr>
          ))}
          {items.length === 0 ? (
            <tr>
              <td colSpan={2} className="px-2 py-4 text-center text-sm text-slate-500">
                No items.
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot className="border-t border-slate-200 font-semibold text-slate-800">
          <tr>
            <td className="px-2 py-2">Total {title}</td>
            <td className="px-2 py-2 text-right font-mono">{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export function BalanceSheetPage() {
  const { pushToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [asOfDate, setAsOfDate] = useState(searchParams.get('asOf') ?? todayIsoDate())
  const [report, setReport] = useState<BalanceSheetReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const next = new URLSearchParams()
    if (asOfDate !== todayIsoDate()) next.set('asOf', asOfDate)
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [asOfDate, searchParams, setSearchParams])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const result = await fetchBalanceSheet(asOfDate)
        if (!cancelled) setReport(result)
      } catch (err) {
        if (!cancelled)
          pushToast('error', err instanceof Error ? err.message : 'Failed to load balance sheet')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [asOfDate, pushToast])

  const liabilitiesPlusEquity = report
    ? Number(report.totalLiabilities) + Number(report.totalEquity)
    : 0
  const balanced =
    report !== null && Math.abs(Number(report.totalAssets) - liabilitiesPlusEquity) < 0.01

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Accounting</p>
          <h2 className="font-display text-xl text-slate-900">Balance Sheet</h2>
          <p className="text-sm text-slate-500">Assets, liabilities, and equity snapshot</p>
        </div>
        <input
          type="date"
          value={asOfDate}
          onChange={(event) => setAsOfDate(event.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading balance sheet...</p> : null}

      {!loading && report ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-800">Total Assets</p>
              <p className="font-display text-2xl text-emerald-900">
                {formatCurrency(report.totalAssets)}
              </p>
            </article>
            <article className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-800">Total Liabilities</p>
              <p className="font-display text-2xl text-amber-900">
                {formatCurrency(report.totalLiabilities)}
              </p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-600">Total Equity</p>
              <p className="font-display text-2xl text-slate-900">
                {formatCurrency(report.totalEquity)}
              </p>
            </article>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Section title="Assets" items={report.assets} total={Number(report.totalAssets)} />
            <div className="space-y-3">
              <Section
                title="Liabilities"
                items={report.liabilities}
                total={Number(report.totalLiabilities)}
              />
              <Section title="Equity" items={report.equity} total={Number(report.totalEquity)} />
            </div>
          </div>

          <p
            className={`text-sm font-semibold ${
              balanced ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {balanced
              ? 'Assets equal Liabilities + Equity.'
              : `Out of balance by ${formatCurrency(
                  Number(report.totalAssets) - liabilitiesPlusEquity,
                )}.`}
          </p>
        </div>
      ) : null}
    </section>
  )
}
