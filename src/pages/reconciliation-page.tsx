import { type FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  completeReconciliation,
  createReconciliation,
  fetchBankAccounts,
  fetchReconciliations,
  type BankAccountResponse,
  type ReconciliationResponse,
} from '../features/accounting/reconciliation-api'
import { ConfirmModal, type ConfirmState } from '../features/ui/confirm-modal'
import { Modal } from '../features/ui/modal'
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

export function ReconciliationPage() {
  const { pushToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [bankAccounts, setBankAccounts] = useState<BankAccountResponse[]>([])
  const [reconciliations, setReconciliations] = useState<ReconciliationResponse[]>([])
  const [bankFilter, setBankFilter] = useState(searchParams.get('bankAccountId') ?? '')
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '0') || 0)
  const [size, setSize] = useState(Number(searchParams.get('size') ?? '20') || 20)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createForm, setCreateForm] = useState({
    bankAccountId: '',
    startDate: monthStartIsoDate(),
    endDate: todayIsoDate(),
    statementBalance: '',
  })

  useEffect(() => {
    const next = new URLSearchParams()
    if (bankFilter) next.set('bankAccountId', bankFilter)
    if (page !== 0) next.set('page', String(page))
    if (size !== 20) next.set('size', String(size))
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [bankFilter, page, size, searchParams, setSearchParams])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const [banks, reconciliationsPage] = await Promise.all([
          fetchBankAccounts({ page: 0, size: 100 }),
          fetchReconciliations({
            bankAccountId: bankFilter || undefined,
            page,
            size,
          }),
        ])
        if (cancelled) return
        setBankAccounts(banks.content)
        setReconciliations(reconciliationsPage.content)
        setTotalPages(reconciliationsPage.totalPages)
      } catch (err) {
        if (!cancelled)
          pushToast('error', err instanceof Error ? err.message : 'Failed to load reconciliations')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [bankFilter, page, size, refreshKey, pushToast])

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!createForm.bankAccountId) {
      pushToast('error', 'Select a bank account.')
      return
    }
    const balance = Number(createForm.statementBalance)
    if (!Number.isFinite(balance)) {
      pushToast('error', 'Statement balance must be a number.')
      return
    }
    setCreateSubmitting(true)
    try {
      await createReconciliation({
        bankAccountId: createForm.bankAccountId,
        startDate: createForm.startDate,
        endDate: createForm.endDate,
        statementBalance: balance,
      })
      setCreateOpen(false)
      setCreateForm({
        bankAccountId: '',
        startDate: monthStartIsoDate(),
        endDate: todayIsoDate(),
        statementBalance: '',
      })
      setRefreshKey((v) => v + 1)
      pushToast('success', 'Reconciliation created.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to create reconciliation')
    } finally {
      setCreateSubmitting(false)
    }
  }

  const handleComplete = (reconciliation: ReconciliationResponse) => {
    setConfirmState({
      title: 'Complete reconciliation',
      message: 'Mark this reconciliation as complete?',
      confirmLabel: 'Mark Complete',
      destructive: false,
      onConfirm: async () => {
        try {
          await completeReconciliation(reconciliation.id)
          setRefreshKey((v) => v + 1)
          pushToast('success', 'Reconciliation marked complete.')
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to complete reconciliation')
        }
        setConfirmState(null)
      },
    })
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Accounting</p>
          <h2 className="font-display text-xl text-slate-900">Bank Reconciliation</h2>
          <p className="text-sm text-slate-500">Compare statement balances to system ledger</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={bankAccounts.length === 0}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          New Reconciliation
        </button>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        <select
          value={bankFilter}
          onChange={(event) => {
            setBankFilter(event.target.value)
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">All bank accounts</option>
          {bankAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} {account.bankName ? `- ${account.bankName}` : ''}
            </option>
          ))}
        </select>
        <select
          value={size}
          onChange={(event) => {
            setSize(Number(event.target.value))
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value={10}>10 rows</option>
          <option value={20}>20 rows</option>
          <option value={50}>50 rows</option>
        </select>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading reconciliations...</p> : null}

      {!loading ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Bank Account</th>
                  <th className="px-2 py-2 font-medium">Period</th>
                  <th className="px-2 py-2 text-right font-medium">Statement</th>
                  <th className="px-2 py-2 text-right font-medium">System</th>
                  <th className="px-2 py-2 text-right font-medium">Difference</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {reconciliations.map((reconciliation) => {
                  const diff = Number(reconciliation.difference ?? 0)
                  return (
                    <tr key={reconciliation.id} className="border-b border-slate-100">
                      <td className="px-2 py-3 text-slate-700">
                        {reconciliation.bankAccountName ?? '-'}
                      </td>
                      <td className="px-2 py-3 text-slate-700">
                        {reconciliation.startDate} — {reconciliation.endDate}
                      </td>
                      <td className="px-2 py-3 text-right font-mono text-slate-800">
                        {formatCurrency(reconciliation.statementBalance)}
                      </td>
                      <td className="px-2 py-3 text-right font-mono text-slate-800">
                        {formatCurrency(reconciliation.systemBalance ?? 0)}
                      </td>
                      <td
                        className={`px-2 py-3 text-right font-mono ${
                          diff < 0 ? 'text-rose-600' : 'text-slate-800'
                        }`}
                      >
                        {diff < 0 ? `(${formatCurrency(Math.abs(diff))})` : formatCurrency(diff)}
                      </td>
                      <td className="px-2 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            reconciliation.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {reconciliation.status}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          onClick={() => handleComplete(reconciliation)}
                          disabled={reconciliation.status === 'COMPLETED'}
                          className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                        >
                          Mark Complete
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {reconciliations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-6 text-center text-sm text-slate-500">
                      No reconciliations yet.
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

      {confirmState ? (
        <ConfirmModal
          {...confirmState}
          onClose={() => setConfirmState(null)}
        />
      ) : null}

      {createOpen ? (
        <Modal
          title="New Reconciliation"
          onClose={() => !createSubmitting && setCreateOpen(false)}
        >
          <form className="space-y-3" onSubmit={submitCreate}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                value={createForm.bankAccountId}
                onChange={(event) =>
                  setCreateForm((p) => ({ ...p, bankAccountId: event.target.value }))
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              >
                <option value="">Select bank account *</option>
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} {account.bankName ? `- ${account.bankName}` : ''}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={createForm.startDate}
                onChange={(event) => setCreateForm((p) => ({ ...p, startDate: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={createForm.endDate}
                onChange={(event) => setCreateForm((p) => ({ ...p, endDate: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="number"
                step="0.01"
                value={createForm.statementBalance}
                onChange={(event) =>
                  setCreateForm((p) => ({ ...p, statementBalance: event.target.value }))
                }
                placeholder="Statement balance *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
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
                {createSubmitting ? 'Creating...' : 'Create Reconciliation'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  )
}
