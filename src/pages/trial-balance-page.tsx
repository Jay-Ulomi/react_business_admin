import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchTrialBalance,
  type TrialBalanceReport,
} from '../features/accounting/reports-api'
import { useToast } from '../features/ui/toast-context'
import { formatCurrency } from '../lib/format'

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function TrialBalancePage() {
  const { pushToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [asOfDate, setAsOfDate] = useState(searchParams.get('asOf') ?? todayIsoDate())
  const [report, setReport] = useState<TrialBalanceReport | null>(null)
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
        const result = await fetchTrialBalance(asOfDate)
        if (!cancelled) setReport(result)
      } catch (err) {
        if (!cancelled)
          pushToast('error', err instanceof Error ? err.message : 'Failed to load trial balance')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [asOfDate, pushToast])

  const balanced =
    report !== null && Math.abs(Number(report.totalDebits) - Number(report.totalCredits)) < 0.01

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Accounting</p>
          <h2 className="font-display text-xl text-slate-900">Trial Balance</h2>
          <p className="text-sm text-slate-500">Debit/credit totals across all accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={asOfDate}
            onChange={(event) => setAsOfDate(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled
            title="Export coming soon"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-400"
          >
            Export
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading trial balance...</p> : null}

      {!loading && report ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Account</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 text-right font-medium">Debit</th>
                  <th className="px-2 py-2 text-right font-medium">Credit</th>
                </tr>
              </thead>
              <tbody>
                {report.entries.map((entry, index) => (
                  <tr key={`${entry.accountName}-${index}`} className="border-b border-slate-100">
                    <td className="px-2 py-2 text-slate-800">{entry.accountName}</td>
                    <td className="px-2 py-2 text-slate-600">{entry.accountType}</td>
                    <td className="px-2 py-2 text-right font-mono text-slate-800">
                      {Number(entry.debitBalance) > 0 ? formatCurrency(entry.debitBalance) : '-'}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-slate-800">
                      {Number(entry.creditBalance) > 0 ? formatCurrency(entry.creditBalance) : '-'}
                    </td>
                  </tr>
                ))}
                {report.entries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-6 text-center text-sm text-slate-500">
                      No entries for this date.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot className="border-t border-slate-200 font-semibold text-slate-800">
                <tr>
                  <td colSpan={2} className="px-2 py-2 text-right">
                    Totals
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {formatCurrency(report.totalDebits)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {formatCurrency(report.totalCredits)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p
            className={`text-sm font-semibold ${
              balanced ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {balanced ? 'Debits and credits balance.' : 'Trial balance is out of balance.'}
          </p>
        </div>
      ) : null}
    </section>
  )
}
