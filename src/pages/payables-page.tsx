import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  createPayable,
  fetchOverduePayables,
  fetchPayables,
  recordPayablePayment,
  type PayableResponse,
} from '../features/accounting/payables-api'
import {
  fetchJournals,
  createJournalEntry,
  postJournalEntry,
  type JournalResponse,
} from '../features/accounting/journal-entries-api'
import {
  fetchAccountsByType,
  type AccountResponse,
} from '../features/accounting/chart-of-accounts-api'
import { fetchSuppliers, type SupplierResponse } from '../features/purchases/purchases-api'
import { Modal } from '../features/ui/modal'
import { useToast } from '../features/ui/toast-context'
import { useBusinessContext } from '../features/context/business-context'
import { formatCurrency } from '../lib/format'

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((end.getTime() - start.getTime()) / msPerDay)
}

type AgingBuckets = {
  current: number
  d1to30: number
  d31to60: number
  d61to90: number
  d90plus: number
}

function computeAging(payables: PayableResponse[]): AgingBuckets {
  const now = new Date()
  const buckets: AgingBuckets = {
    current: 0,
    d1to30: 0,
    d31to60: 0,
    d61to90: 0,
    d90plus: 0,
  }
  for (const p of payables) {
    const balance = Number(p.balance ?? 0)
    if (balance <= 0) continue
    const due = new Date(p.dueDate)
    const overdueDays = daysBetween(due, now)
    if (overdueDays <= 0) buckets.current += balance
    else if (overdueDays <= 30) buckets.d1to30 += balance
    else if (overdueDays <= 60) buckets.d31to60 += balance
    else if (overdueDays <= 90) buckets.d61to90 += balance
    else buckets.d90plus += balance
  }
  return buckets
}

export function PayablesPage() {
  const { pushToast } = useToast()
  const { selectedContext } = useBusinessContext()
  const [searchParams, setSearchParams] = useSearchParams()

  const [payables, setPayables] = useState<PayableResponse[]>([])
  const [overdue, setOverdue] = useState<PayableResponse[]>([])
  const [suppliers, setSuppliers] = useState<SupplierResponse[]>([])
  const [supplierFilter, setSupplierFilter] = useState(searchParams.get('supplierId') ?? '')
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '0') || 0)
  const [size, setSize] = useState(Number(searchParams.get('size') ?? '20') || 20)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createForm, setCreateForm] = useState({
    supplierId: '',
    amount: '',
    dueDate: todayIsoDate(),
  })

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentTarget, setPaymentTarget] = useState<PayableResponse | null>(null)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentDate: todayIsoDate(),
    paymentMethod: 'CASH',
    reference: '',
  })

  // JE state — Dr AP / Cr Cash after payment
  const [jePayable, setJePayable] = useState<{ amount: number; supplierName: string } | null>(null)
  const [journals, setJournals] = useState<JournalResponse[]>([])
  const [liabilityAccounts, setLiabilityAccounts] = useState<AccountResponse[]>([])
  const [assetAccounts, setAssetAccounts] = useState<AccountResponse[]>([])
  const [jeJournalId, setJeJournalId] = useState('')
  const [jeDebitId, setJeDebitId] = useState('')
  const [jeCreditId, setJeCreditId] = useState('')
  const [jeSubmitting, setJeSubmitting] = useState(false)

  useEffect(() => {
    const next = new URLSearchParams()
    if (supplierFilter) next.set('supplierId', supplierFilter)
    if (page !== 0) next.set('page', String(page))
    if (size !== 20) next.set('size', String(size))
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [supplierFilter, page, size, searchParams, setSearchParams])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const [payablesPage, overdueList, suppliersPage] = await Promise.all([
          fetchPayables({
            supplierId: supplierFilter || undefined,
            page,
            size,
          }),
          fetchOverduePayables().catch(() => [] as PayableResponse[]),
          fetchSuppliers({ isActive: true, page: 0, size: 200 }),
        ])
        if (cancelled) return
        setPayables(payablesPage.content)
        setTotalPages(payablesPage.totalPages)
        setTotalElements(payablesPage.totalElements)
        setOverdue(overdueList)
        setSuppliers(suppliersPage.content)
      } catch (err) {
        if (!cancelled)
          pushToast('error', err instanceof Error ? err.message : 'Failed to load payables')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [supplierFilter, page, size, refreshKey, pushToast])

  const aging = useMemo(() => computeAging(payables), [payables])
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!createForm.supplierId) {
      pushToast('error', 'Select a supplier.')
      return
    }
    const amount = Number(createForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      pushToast('error', 'Amount must be a positive number.')
      return
    }
    setCreateSubmitting(true)
    try {
      await createPayable({
        supplierId: createForm.supplierId,
        amount,
        dueDate: createForm.dueDate,
      })
      setCreateOpen(false)
      setCreateForm({ supplierId: '', amount: '', dueDate: todayIsoDate() })
      setRefreshKey((v) => v + 1)
      pushToast('success', 'Payable created.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to create payable')
    } finally {
      setCreateSubmitting(false)
    }
  }

  const openPayment = (payable: PayableResponse) => {
    setPaymentTarget(payable)
    setPaymentForm({
      amount: String(payable.balance ?? ''),
      paymentDate: todayIsoDate(),
      paymentMethod: 'CASH',
      reference: '',
    })
    setPaymentOpen(true)
  }

  const submitPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!paymentTarget) return
    const amount = Number(paymentForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      pushToast('error', 'Payment amount must be positive.')
      return
    }
    if (!paymentForm.paymentMethod.trim()) {
      pushToast('error', 'Payment method is required.')
      return
    }
    setPaymentSubmitting(true)
    try {
      await recordPayablePayment(paymentTarget.id, {
        amount,
        paymentDate: paymentForm.paymentDate,
        paymentMethod: paymentForm.paymentMethod.trim(),
        reference: paymentForm.reference.trim() || undefined,
      })
      setPaymentOpen(false)
      const paidSupplier = supplierName(paymentTarget.supplierId)
      const paidAmount = amount
      setPaymentTarget(null)
      setRefreshKey((v) => v + 1)
      pushToast('success', 'Payment recorded.')

      // Load accounting resources and open JE modal
      const [journalList, liabList, assetList] = await Promise.all([
        fetchJournals().catch(() => [] as JournalResponse[]),
        fetchAccountsByType('LIABILITY').catch(() => [] as AccountResponse[]),
        fetchAccountsByType('ASSET').catch(() => [] as AccountResponse[]),
      ])
      setJournals(journalList)
      setLiabilityAccounts(liabList)
      setAssetAccounts(assetList)
      setJeJournalId(journalList[0]?.id ?? '')
      setJeDebitId(liabList[0]?.id ?? '')
      setJeCreditId(assetList[0]?.id ?? '')
      setJePayable({ amount: paidAmount, supplierName: paidSupplier })
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setPaymentSubmitting(false)
    }
  }

  const handleSubmitPaymentJE = async () => {
    if (!jePayable || !jeJournalId || !jeDebitId || !jeCreditId) return
    setJeSubmitting(true)
    try {
      const entry = await createJournalEntry({
        journalId: jeJournalId,
        branchId: selectedContext?.branchId,
        entryDate: new Date().toISOString(),
        description: `Payable payment — ${jePayable.supplierName}`,
        referenceType: 'MANUAL',
        lines: [
          {
            accountId: jeDebitId,
            description: 'Clear accounts payable',
            debitAmount: jePayable.amount,
            creditAmount: 0,
          },
          {
            accountId: jeCreditId,
            description: 'Payment from cash / bank',
            debitAmount: 0,
            creditAmount: jePayable.amount,
          },
        ],
      })
      await postJournalEntry(entry.id)
      pushToast('success', `Journal entry ${entry.entryNumber} posted`)
      setJePayable(null)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to post journal entry')
    } finally {
      setJeSubmitting(false)
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Accounting</p>
          <h2 className="font-display text-xl text-slate-900">Supplier Payables</h2>
          <p className="text-sm text-slate-500">
            Total: {totalElements} | Overdue: {overdue.length}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Add Payable
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-800">Current</p>
          <p className="font-display text-lg text-emerald-900">{formatCurrency(aging.current)}</p>
        </article>
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">1-30 days</p>
          <p className="font-display text-lg text-amber-900">{formatCurrency(aging.d1to30)}</p>
        </article>
        <article className="rounded-xl border border-amber-300 bg-amber-100 p-3">
          <p className="text-xs text-amber-900">31-60 days</p>
          <p className="font-display text-lg text-amber-950">{formatCurrency(aging.d31to60)}</p>
        </article>
        <article className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs text-rose-700">61-90 days</p>
          <p className="font-display text-lg text-rose-800">{formatCurrency(aging.d61to90)}</p>
        </article>
        <article className="rounded-xl border border-rose-300 bg-rose-100 p-3">
          <p className="text-xs text-rose-800">90+ days</p>
          <p className="font-display text-lg text-rose-900">{formatCurrency(aging.d90plus)}</p>
        </article>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        <select
          value={supplierFilter}
          onChange={(event) => {
            setSupplierFilter(event.target.value)
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">All suppliers</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
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

      {loading ? <p className="text-sm text-slate-500">Loading payables...</p> : null}

      {!loading ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Supplier</th>
                  <th className="px-2 py-2 font-medium">Due Date</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                  <th className="px-2 py-2 text-right font-medium">Paid</th>
                  <th className="px-2 py-2 text-right font-medium">Balance</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {payables.map((payable) => {
                  const balance = Number(payable.balance ?? 0)
                  return (
                    <tr key={payable.id} className="border-b border-slate-100">
                      <td className="px-2 py-3 text-slate-700">{supplierName(payable.supplierId)}</td>
                      <td className="px-2 py-3 text-slate-700">{payable.dueDate}</td>
                      <td className="px-2 py-3 text-right font-mono text-slate-800">
                        {formatCurrency(payable.amount)}
                      </td>
                      <td className="px-2 py-3 text-right font-mono text-slate-800">
                        {formatCurrency(payable.paidAmount)}
                      </td>
                      <td
                        className={`px-2 py-3 text-right font-mono ${
                          balance > 0 ? 'text-slate-800' : 'text-emerald-700'
                        }`}
                      >
                        {formatCurrency(balance)}
                      </td>
                      <td className="px-2 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            payable.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : payable.status === 'OVERDUE'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {payable.status}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          onClick={() => openPayment(payable)}
                          disabled={balance <= 0}
                          className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                        >
                          Record Payment
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {payables.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-6 text-center text-sm text-slate-500">
                      No payables found.
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

      {createOpen ? (
        <Modal title="Add Payable" onClose={() => !createSubmitting && setCreateOpen(false)}>
          <form className="space-y-3" onSubmit={submitCreate}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                value={createForm.supplierId}
                onChange={(event) =>
                  setCreateForm((p) => ({ ...p, supplierId: event.target.value }))
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              >
                <option value="">Select supplier *</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={createForm.amount}
                onChange={(event) => setCreateForm((p) => ({ ...p, amount: event.target.value }))}
                placeholder="Amount *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={createForm.dueDate}
                onChange={(event) => setCreateForm((p) => ({ ...p, dueDate: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
                {createSubmitting ? 'Creating...' : 'Create Payable'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {paymentOpen && paymentTarget ? (
        <Modal
          title={`Record Payment — ${supplierName(paymentTarget.supplierId)}`}
          onClose={() => !paymentSubmitting && setPaymentOpen(false)}
        >
          <form className="space-y-3" onSubmit={submitPayment}>
            <p className="text-sm text-slate-600">
              Outstanding balance: {formatCurrency(paymentTarget.balance)}
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={paymentForm.amount}
                onChange={(event) => setPaymentForm((p) => ({ ...p, amount: event.target.value }))}
                placeholder="Amount *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={paymentForm.paymentDate}
                onChange={(event) =>
                  setPaymentForm((p) => ({ ...p, paymentDate: event.target.value }))
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={paymentForm.paymentMethod}
                onChange={(event) =>
                  setPaymentForm((p) => ({ ...p, paymentMethod: event.target.value }))
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="CASH">CASH</option>
                <option value="BANK">BANK</option>
                <option value="MOBILE_MONEY">MOBILE_MONEY</option>
              </select>
              <input
                value={paymentForm.reference}
                onChange={(event) => setPaymentForm((p) => ({ ...p, reference: event.target.value }))}
                placeholder="Reference"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPaymentOpen(false)}
                disabled={paymentSubmitting}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={paymentSubmitting}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {paymentSubmitting ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* JE modal — Dr AP / Cr Cash after payment */}
      {jePayable ? (
        <Modal
          title="Record payment in accounting"
          onClose={() => !jeSubmitting && setJePayable(null)}
        >
          <p className="text-sm text-slate-600">
            Payment of <strong>{formatCurrency(jePayable.amount)}</strong> to{' '}
            <strong>{jePayable.supplierName}</strong> recorded. Post the double-entry to your books.
          </p>
          <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            Dr Accounts Payable &nbsp;/&nbsp; Cr Cash / Bank
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Journal
              </label>
              <select
                aria-label="Journal"
                value={jeJournalId}
                onChange={(e) => setJeJournalId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">— select journal —</option>
                {journals.map((j) => (
                  <option key={j.id} value={j.id}>{j.name}</option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Side</th>
                    <th className="px-3 py-2 font-medium">Account</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2 text-xs font-semibold text-slate-500">Dr (AP)</td>
                    <td className="px-3 py-2">
                      <select
                        aria-label="Debit account (Accounts Payable)"
                        value={jeDebitId}
                        onChange={(e) => setJeDebitId(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      >
                        <option value="">— select account —</option>
                        {liabilityAccounts.filter((a) => a.isActive).map((a) => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-800">
                      {formatCurrency(jePayable.amount)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-xs font-semibold text-slate-500">Cr (Cash)</td>
                    <td className="px-3 py-2">
                      <select
                        aria-label="Credit account (Cash / Bank)"
                        value={jeCreditId}
                        onChange={(e) => setJeCreditId(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      >
                        <option value="">— select account —</option>
                        {assetAccounts.filter((a) => a.isActive).map((a) => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-800">
                      {formatCurrency(jePayable.amount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setJePayable(null)}
              disabled={jeSubmitting}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleSubmitPaymentJE}
              disabled={jeSubmitting || !jeJournalId || !jeDebitId || !jeCreditId}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {jeSubmitting ? 'Posting...' : 'Post journal entry'}
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}
