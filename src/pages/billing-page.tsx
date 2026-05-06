import { useEffect, useState } from 'react'
import {
  fetchCurrentSubscription,
  fetchPlans,
  fetchInvoices,
  createSubscription,
  changePlan,
  cancelSubscription,
  markInvoicePaid,
  type Subscription,
  type Plan,
  type BillingCycle,
  type SubscriptionStatus,
  type Invoice,
  type InvoiceStatus,
} from '../features/subscription/subscription-api'
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
import { useBusinessContext } from '../features/context/business-context'
import { Modal } from '../features/ui/modal'
import { useToast } from '../features/ui/toast-context'

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000)
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(isoDate))
}

function statusBadge(status: SubscriptionStatus) {
  const map: Record<SubscriptionStatus, { label: string; cls: string }> = {
    TRIAL:    { label: 'Trial',    cls: 'bg-amber-100 text-amber-800' },
    ACTIVE:   { label: 'Active',   cls: 'bg-emerald-100 text-emerald-800' },
    PAST_DUE: { label: 'Past Due', cls: 'bg-orange-100 text-orange-700' },
    SUSPENDED:{ label: 'Suspended',cls: 'bg-rose-100 text-rose-700' },
    CANCELED: { label: 'Canceled', cls: 'bg-slate-100 text-slate-600' },
    EXPIRED:  { label: 'Expired',  cls: 'bg-rose-100 text-rose-700' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${cls}`}>{label}</span>
  )
}

function invoiceStatusBadge(status: InvoiceStatus) {
  const map: Record<InvoiceStatus, { label: string; cls: string }> = {
    PENDING: { label: 'Pending', cls: 'bg-amber-100 text-amber-800' },
    PAID:    { label: 'Paid',    cls: 'bg-emerald-100 text-emerald-800' },
    OVERDUE: { label: 'Overdue', cls: 'bg-rose-100 text-rose-700' },
    CANCELED:{ label: 'Canceled',cls: 'bg-slate-100 text-slate-600' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' }
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${cls}`}>{label}</span>
}

// ── Shared: load accounting resources ────────────────────────────────────────

async function loadAccountingResources() {
  const [journalList, expList, liabList, assetList] = await Promise.all([
    fetchJournals().catch(() => [] as JournalResponse[]),
    fetchAccountsByType('EXPENSE').catch(() => [] as AccountResponse[]),
    fetchAccountsByType('LIABILITY').catch(() => [] as AccountResponse[]),
    fetchAccountsByType('ASSET').catch(() => [] as AccountResponse[]),
  ])
  return { journalList, expList, liabList, assetList }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function BillingPage() {
  const { pushToast } = useToast()
  const { selectedContext } = useBusinessContext()

  // ── Core data ──────────────────────────────────────────────────────────────
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY')
  const [invoiceFilter, setInvoiceFilter] = useState<'ALL' | 'OUTSTANDING' | 'PAID'>('ALL')

  // Tracks which invoices had an accrual JE recorded this session
  const [accruedInvoiceIds, setAccruedInvoiceIds] = useState<Set<string>>(new Set())

  // ── Plan select / cancel ───────────────────────────────────────────────────
  const [selectPlan, setSelectPlan] = useState<Plan | null>(null)
  const [selectSubmitting, setSelectSubmitting] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelSubmitting, setCancelSubmitting] = useState(false)

  // ── Shared accounting state ────────────────────────────────────────────────
  const [journals, setJournals] = useState<JournalResponse[]>([])
  const [expenseAccounts, setExpenseAccounts] = useState<AccountResponse[]>([])
  const [liabilityAccounts, setLiabilityAccounts] = useState<AccountResponse[]>([])
  const [assetAccounts, setAssetAccounts] = useState<AccountResponse[]>([])

  // ── Accrual modal (invoice issued → Dr Expense / Cr AP) ───────────────────
  const [accrualInvoice, setAccrualInvoice] = useState<Invoice | null>(null)
  const [accrualJournalId, setAccrualJournalId] = useState('')
  const [accrualDebitId, setAccrualDebitId] = useState('')   // EXPENSE account
  const [accrualCreditId, setAccrualCreditId] = useState('') // LIABILITY (AP) account
  const [accrualSubmitting, setAccrualSubmitting] = useState(false)

  // ── Settlement modal (invoice paid → Dr AP / Cr Cash, or Dr Expense / Cr Cash) ──
  const [jeInvoice, setJeInvoice] = useState<Invoice | null>(null)
  const [jeIsSettlement, setJeIsSettlement] = useState(false) // true = accrual was pre-recorded
  const [jeJournalId, setJeJournalId] = useState('')
  const [jeDebitId, setJeDebitId] = useState('')
  const [jeCreditId, setJeCreditId] = useState('')
  const [jeSubmitting, setJeSubmitting] = useState(false)

  // ── Load page data ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const [sub, planList, invoiceList] = await Promise.all([
          fetchCurrentSubscription().catch(() => null),
          fetchPlans().catch(() => [] as Plan[]),
          fetchInvoices().catch(() => [] as Invoice[]),
        ])
        if (cancelled) return
        setSubscription(sub)
        setPlans(planList.sort((a, b) => a.sortOrder - b.sortOrder))
        setInvoices(invoiceList)
        if (sub?.billingCycle) setBillingCycle(sub.billingCycle)
      } catch (err) {
        if (!cancelled) pushToast('error', err instanceof Error ? err.message : 'Failed to load billing')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [])

  // ── Derived invoice lists ──────────────────────────────────────────────────
  const sortedInvoices = [...invoices].sort(
    (a, b) => new Date(b.issuedDate).getTime() - new Date(a.issuedDate).getTime(),
  )
  const filteredInvoices = sortedInvoices.filter((inv) => {
    if (invoiceFilter === 'OUTSTANDING') return inv.status === 'PENDING' || inv.status === 'OVERDUE'
    if (invoiceFilter === 'PAID') return inv.status === 'PAID'
    return true
  })
  const outstandingCount = invoices.filter(
    (inv) => inv.status === 'PENDING' || inv.status === 'OVERDUE',
  ).length

  // ── Plan handlers ──────────────────────────────────────────────────────────
  const handleSelectPlan = async () => {
    if (!selectPlan) return
    setSelectSubmitting(true)
    try {
      const updated = subscription
        ? await changePlan(subscription.id, selectPlan.id)
        : await createSubscription({ planId: selectPlan.id, billingCycle, startWithTrial: true, autoRenew: true })
      setSubscription(updated)
      setSelectPlan(null)
      pushToast('success', `Switched to ${selectPlan.name}`)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to change plan')
    } finally {
      setSelectSubmitting(false)
    }
  }

  const handleCancel = async () => {
    if (!subscription) return
    setCancelSubmitting(true)
    try {
      const updated = await cancelSubscription(subscription.id, cancelReason || undefined)
      setSubscription(updated)
      setCancelOpen(false)
      setCancelReason('')
      pushToast('success', 'Subscription cancelled')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Cancellation failed')
    } finally {
      setCancelSubmitting(false)
    }
  }

  // ── Accrual: record invoice when issued (Dr Expense / Cr AP) ──────────────
  const handleOpenAccrual = async (invoice: Invoice) => {
    try {
      const { journalList, expList, liabList } = await loadAccountingResources()
      setJournals(journalList)
      setExpenseAccounts(expList)
      setLiabilityAccounts(liabList)
      setAccrualJournalId(journalList[0]?.id ?? '')
      setAccrualDebitId(expList[0]?.id ?? '')
      setAccrualCreditId(liabList[0]?.id ?? '')
      setAccrualInvoice(invoice)
    } catch {
      pushToast('error', 'Failed to load accounting accounts')
    }
  }

  const handleSubmitAccrual = async () => {
    if (!accrualInvoice || !accrualJournalId || !accrualDebitId || !accrualCreditId) return
    setAccrualSubmitting(true)
    try {
      const entry = await createJournalEntry({
        journalId: accrualJournalId,
        branchId: selectedContext?.branchId,
        entryDate: accrualInvoice.issuedDate ? new Date(accrualInvoice.issuedDate).toISOString() : new Date().toISOString(),
        description: `Subscription accrual — ${accrualInvoice.invoiceNumber}`,
        referenceType: 'MANUAL',
        lines: [
          {
            accountId: accrualDebitId,
            description: 'Subscription expense accrual',
            debitAmount: accrualInvoice.amount,
            creditAmount: 0,
          },
          {
            accountId: accrualCreditId,
            description: 'Accounts payable — subscription',
            debitAmount: 0,
            creditAmount: accrualInvoice.amount,
          },
        ],
      })
      await postJournalEntry(entry.id)
      setAccruedInvoiceIds((prev) => new Set(prev).add(accrualInvoice.id))
      pushToast('success', `Accrual entry ${entry.entryNumber} posted`)
      setAccrualInvoice(null)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to record accrual')
    } finally {
      setAccrualSubmitting(false)
    }
  }

  // ── Payment: mark paid + open settlement/cash JE modal ────────────────────
  const handleMarkPaid = async (invoice: Invoice) => {
    try {
      const updated = await markInvoicePaid(invoice.id)
      setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)))
      pushToast('success', `Invoice ${updated.invoiceNumber} marked as paid`)

      const isSettlement = accruedInvoiceIds.has(invoice.id)
      const { journalList, expList, liabList, assetList } = await loadAccountingResources()
      setJournals(journalList)
      setExpenseAccounts(expList)
      setLiabilityAccounts(liabList)
      setAssetAccounts(assetList)
      setJeJournalId(journalList[0]?.id ?? '')
      setJeIsSettlement(isSettlement)

      if (isSettlement) {
        // Accrual was pre-recorded → settle AP: Dr AP / Cr Cash
        setJeDebitId(liabList[0]?.id ?? '')
        setJeCreditId(assetList[0]?.id ?? '')
      } else {
        // Cash basis: Dr Expense / Cr Cash (no prior accrual)
        setJeDebitId(expList[0]?.id ?? '')
        setJeCreditId(assetList[0]?.id ?? '')
      }

      setJeInvoice(updated)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to mark invoice as paid')
    }
  }

  const handleSubmitPaymentJE = async () => {
    if (!jeInvoice || !jeJournalId || !jeDebitId || !jeCreditId) return
    setJeSubmitting(true)
    try {
      const entry = await createJournalEntry({
        journalId: jeJournalId,
        branchId: selectedContext?.branchId,
        entryDate: new Date().toISOString(),
        description: jeIsSettlement
          ? `Subscription payment — settle AP — ${jeInvoice.invoiceNumber}`
          : `Subscription payment — ${jeInvoice.invoiceNumber}`,
        referenceType: 'MANUAL',
        lines: [
          {
            accountId: jeDebitId,
            description: jeIsSettlement ? 'Clear accounts payable' : 'Subscription expense',
            debitAmount: jeInvoice.amount,
            creditAmount: 0,
          },
          {
            accountId: jeCreditId,
            description: 'Payment from cash / bank',
            debitAmount: 0,
            creditAmount: jeInvoice.amount,
          },
        ],
      })
      await postJournalEntry(entry.id)
      pushToast('success', `Journal entry ${entry.entryNumber} posted`)
      setJeInvoice(null)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to record journal entry')
    } finally {
      setJeSubmitting(false)
    }
  }

  const trialDays = daysUntil(subscription?.trialEndDate ?? null)
  const isCancelable = subscription?.status === 'ACTIVE' || subscription?.status === 'TRIAL'

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Account</p>
          <h2 className="font-display text-xl text-slate-900">Billing &amp; Subscription</h2>
          <p className="text-sm text-slate-500">Manage your plan and subscription status.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading billing...</p>
      ) : (
        <>
          {/* ── Current subscription ──────────────────────────────────────── */}
          <div className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Current subscription
            </p>

            {subscription ? (
              <div className="rounded-2xl border border-emerald-100 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-50 px-4 py-3">
                  <div>
                    <p className="text-xs text-slate-500">Plan</p>
                    <p className="font-display text-lg font-semibold text-slate-900">{subscription.planName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {statusBadge(subscription.status)}
                    {isCancelable && (
                      <button
                        type="button"
                        onClick={() => setCancelOpen(true)}
                        className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-px bg-emerald-50 sm:grid-cols-4">
                  <article className="bg-white px-4 py-3">
                    <p className="text-xs text-slate-500">Billing</p>
                    <p className="mt-1 font-display text-base font-semibold text-slate-900 capitalize">
                      {subscription.billingCycle?.toLowerCase() ?? '—'}
                    </p>
                  </article>
                  <article className="bg-white px-4 py-3">
                    <p className="text-xs text-slate-500">Auto-renew</p>
                    <p className="mt-1 font-display text-base font-semibold text-slate-900">
                      {subscription.autoRenew ? 'On' : 'Off'}
                    </p>
                  </article>
                  {subscription.status === 'TRIAL' && subscription.trialEndDate ? (
                    <article className={`bg-white px-4 py-3 ${trialDays !== null && trialDays <= 7 ? 'bg-amber-50' : ''}`}>
                      <p className="text-xs text-slate-500">Trial ends</p>
                      <p className={`mt-1 font-display text-base font-semibold ${trialDays !== null && trialDays <= 7 ? 'text-amber-700' : 'text-slate-900'}`}>
                        {formatDate(subscription.trialEndDate)}
                      </p>
                      {trialDays !== null && (
                        <p className="text-[11px] text-slate-400">
                          {trialDays > 0 ? `${trialDays} day${trialDays === 1 ? '' : 's'} left` : 'Ended'}
                        </p>
                      )}
                    </article>
                  ) : subscription.endDate ? (
                    <article className="bg-white px-4 py-3">
                      <p className="text-xs text-slate-500">
                        {subscription.status === 'ACTIVE' ? 'Renews on' : 'Ends on'}
                      </p>
                      <p className="mt-1 font-display text-base font-semibold text-slate-900">
                        {formatDate(subscription.endDate)}
                      </p>
                    </article>
                  ) : (
                    <article className="bg-white px-4 py-3">
                      <p className="text-xs text-slate-500">End date</p>
                      <p className="mt-1 font-display text-base font-semibold text-slate-900">—</p>
                    </article>
                  )}
                  <article className="bg-white px-4 py-3">
                    <p className="text-xs text-slate-500">Started</p>
                    <p className="mt-1 font-display text-base font-semibold text-slate-900">
                      {formatDate(subscription.startDate)}
                    </p>
                  </article>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                No active subscription. Choose a plan below.
              </p>
            )}
          </div>

          {/* ── Invoice history ───────────────────────────────────────────── */}
          <div className="mb-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Invoice history
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Record accrual when an invoice arrives, then settle on payment.
                </p>
              </div>
              {invoices.length > 0 && (
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  {(['ALL', 'OUTSTANDING', 'PAID'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setInvoiceFilter(f)}
                      className={`relative rounded-md px-3 py-1 text-xs font-semibold transition ${
                        invoiceFilter === f
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {f === 'ALL' ? 'All' : f === 'OUTSTANDING' ? 'Outstanding' : 'Paid'}
                      {f === 'OUTSTANDING' && outstandingCount > 0 && (
                        <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                          {outstandingCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Accrual accounting legend */}
            <div className="mb-3 flex flex-wrap gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <span>
                <strong className="text-amber-700">Record Accrual</strong> — Dr Subscription Expense / Cr Accounts Payable (when invoice arrives)
              </span>
              <span>
                <strong className="text-emerald-700">Mark Paid</strong> — Dr Accounts Payable / Cr Cash (if accrual recorded) or Dr Expense / Cr Cash (cash basis)
              </span>
            </div>

            {invoices.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                No invoices yet.
              </p>
            ) : filteredInvoices.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                No {invoiceFilter === 'OUTSTANDING' ? 'outstanding' : 'paid'} invoices.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Invoice #</th>
                      <th className="px-2 py-2 font-medium">Issued</th>
                      <th className="px-2 py-2 font-medium">Due</th>
                      {invoiceFilter !== 'OUTSTANDING' && (
                        <th className="px-2 py-2 font-medium">Paid on</th>
                      )}
                      <th className="px-2 py-2 text-right font-medium">Amount</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map((inv) => {
                      const hasAccrual = accruedInvoiceIds.has(inv.id)
                      const isOutstanding = inv.status === 'PENDING' || inv.status === 'OVERDUE'
                      return (
                        <tr
                          key={inv.id}
                          className={`border-b border-slate-100 ${inv.status === 'OVERDUE' ? 'bg-rose-50/40' : ''}`}
                        >
                          <td className="px-2 py-3 font-mono text-xs text-slate-800">{inv.invoiceNumber}</td>
                          <td className="px-2 py-3 text-slate-600">{formatDate(inv.issuedDate)}</td>
                          <td className={`px-2 py-3 ${inv.status === 'OVERDUE' ? 'font-semibold text-rose-600' : 'text-slate-600'}`}>
                            {formatDate(inv.dueDate)}
                          </td>
                          {invoiceFilter !== 'OUTSTANDING' && (
                            <td className="px-2 py-3 text-slate-600">
                              {inv.paidDate ? formatDate(inv.paidDate) : '—'}
                            </td>
                          )}
                          <td className="px-2 py-3 text-right font-mono text-slate-800">
                            {inv.currency} {inv.amount.toFixed(2)}
                          </td>
                          <td className="px-2 py-3">{invoiceStatusBadge(inv.status)}</td>
                          <td className="px-2 py-3">
                            {isOutstanding && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {hasAccrual ? (
                                  <span className="text-xs font-semibold text-emerald-600">
                                    Accrual ✓
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAccrual(inv)}
                                    className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                                  >
                                    Record Accrual
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleMarkPaid(inv)}
                                  className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                                >
                                  Mark Paid
                                </button>
                              </div>
                            )}
                            {inv.status === 'PAID' && (
                              <span className="text-xs text-slate-400">Settled</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Available plans ───────────────────────────────────────────── */}
          {plans.length > 0 && (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Available plans
                </p>
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  {(['MONTHLY', 'ANNUAL'] as const).map((cycle) => (
                    <button
                      key={cycle}
                      type="button"
                      onClick={() => setBillingCycle(cycle)}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                        billingCycle === cycle
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {cycle === 'MONTHLY' ? 'Monthly' : 'Annual'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Plan</th>
                      <th className="px-2 py-2 font-medium">Price</th>
                      <th className="px-2 py-2 font-medium">Trial</th>
                      <th className="px-2 py-2 font-medium">Branches</th>
                      <th className="px-2 py-2 font-medium">Users</th>
                      <th className="px-2 py-2 font-medium">Features</th>
                      <th className="px-2 py-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((plan) => {
                      const price = billingCycle === 'ANNUAL' ? (plan.annualPrice ?? 0) : (plan.monthlyPrice ?? 0)
                      const isCurrent =
                        subscription?.planId === plan.id &&
                        (subscription.status === 'ACTIVE' || subscription.status === 'TRIAL')
                      const enabledFeatures = plan.features.filter((f) => f.isEnabled)
                      return (
                        <tr key={plan.id} className="border-b border-slate-100">
                          <td className="px-2 py-3">
                            <span className="font-medium text-slate-800">{plan.name}</span>
                            {plan.isDefault && (
                              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                Recommended
                              </span>
                            )}
                            {plan.description && (
                              <p className="mt-0.5 text-xs text-slate-400">{plan.description}</p>
                            )}
                          </td>
                          <td className="px-2 py-3 font-mono text-slate-800">
                            {price > 0 ? `${price.toFixed(2)} / ${billingCycle === 'MONTHLY' ? 'mo' : 'yr'}` : 'Free'}
                          </td>
                          <td className="px-2 py-3 text-slate-600">
                            {plan.trialDays > 0 ? `${plan.trialDays}d` : '—'}
                          </td>
                          <td className="px-2 py-3 text-slate-600">{plan.maxBranches}</td>
                          <td className="px-2 py-3 text-slate-600">{plan.maxUsers}</td>
                          <td className="px-2 py-3 text-slate-500">
                            {enabledFeatures.length > 0
                              ? enabledFeatures.map((f) => f.featureName).join(', ')
                              : '—'}
                          </td>
                          <td className="px-2 py-3">
                            {isCurrent ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                                Current
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setSelectPlan(plan)}
                                className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                              >
                                Select
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modal: Confirm plan ─────────────────────────────────────────────── */}
      {selectPlan && (
        <Modal title="Confirm plan" onClose={() => !selectSubmitting && setSelectPlan(null)}>
          <p className="text-sm text-slate-600">
            Switch to <strong>{selectPlan.name}</strong> ({billingCycle.toLowerCase()}).
            {selectPlan.trialDays > 0 && !subscription
              ? ` Includes a ${selectPlan.trialDays}-day free trial.`
              : ''}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSelectPlan(null)}
              disabled={selectSubmitting}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSelectPlan}
              disabled={selectSubmitting}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {selectSubmitting ? 'Processing...' : 'Confirm'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Record accrual (Dr Expense / Cr AP) ─────────────────────── */}
      {accrualInvoice && (
        <Modal
          title="Record invoice accrual"
          onClose={() => !accrualSubmitting && setAccrualInvoice(null)}
        >
          <p className="text-sm text-slate-600">
            Invoice <strong>{accrualInvoice.invoiceNumber}</strong> has arrived ({accrualInvoice.currency}{' '}
            {accrualInvoice.amount.toFixed(2)}). Record the accrual so your books show the liability
            before payment is made.
          </p>

          <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Dr Subscription Expense &nbsp;/&nbsp; Cr Accounts Payable
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Journal
              </label>
              <select
                aria-label="Journal"
                value={accrualJournalId}
                onChange={(e) => setAccrualJournalId(e.target.value)}
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
                    <td className="px-3 py-2 text-xs font-semibold text-slate-500">Dr (Expense)</td>
                    <td className="px-3 py-2">
                      <select
                        aria-label="Debit account (Subscription Expense)"
                        value={accrualDebitId}
                        onChange={(e) => setAccrualDebitId(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      >
                        <option value="">— select account —</option>
                        {expenseAccounts.filter((a) => a.isActive).map((a) => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-800">
                      {accrualInvoice.currency} {accrualInvoice.amount.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-xs font-semibold text-slate-500">Cr (AP)</td>
                    <td className="px-3 py-2">
                      <select
                        aria-label="Credit account (Accounts Payable)"
                        value={accrualCreditId}
                        onChange={(e) => setAccrualCreditId(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      >
                        <option value="">— select account —</option>
                        {liabilityAccounts.filter((a) => a.isActive).map((a) => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-800">
                      {accrualInvoice.currency} {accrualInvoice.amount.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAccrualInvoice(null)}
              disabled={accrualSubmitting}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleSubmitAccrual}
              disabled={accrualSubmitting || !accrualJournalId || !accrualDebitId || !accrualCreditId}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {accrualSubmitting ? 'Posting...' : 'Post accrual entry'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Record payment JE ────────────────────────────────────────── */}
      {jeInvoice && (
        <Modal
          title={jeIsSettlement ? 'Settle accounts payable' : 'Record payment'}
          onClose={() => !jeSubmitting && setJeInvoice(null)}
        >
          <p className="text-sm text-slate-600">
            Invoice <strong>{jeInvoice.invoiceNumber}</strong> — {jeInvoice.currency}{' '}
            {jeInvoice.amount.toFixed(2)} is now paid.
            {jeIsSettlement
              ? ' Clear the accounts payable liability and record the cash outflow.'
              : ' Record the cash payment directly to expense (cash-basis).'}
          </p>

          <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
            jeIsSettlement
              ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
              : 'border-slate-100 bg-slate-50 text-slate-500'
          }`}>
            {jeIsSettlement
              ? 'Dr Accounts Payable  /  Cr Cash / Bank'
              : 'Dr Subscription Expense  /  Cr Cash / Bank'}
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
                    <td className="px-3 py-2 text-xs font-semibold text-slate-500">
                      {jeIsSettlement ? 'Dr (AP)' : 'Dr (Expense)'}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        aria-label={jeIsSettlement ? 'Debit account (Accounts Payable)' : 'Debit account (Expense)'}
                        value={jeDebitId}
                        onChange={(e) => setJeDebitId(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      >
                        <option value="">— select account —</option>
                        {(jeIsSettlement ? liabilityAccounts : expenseAccounts)
                          .filter((a) => a.isActive)
                          .map((a) => (
                            <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                          ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-800">
                      {jeInvoice.currency} {jeInvoice.amount.toFixed(2)}
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
                      {jeInvoice.currency} {jeInvoice.amount.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-400">
              The entry will be posted immediately and will appear in Journal Entries.
            </p>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setJeInvoice(null)}
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
      )}

      {/* ── Modal: Cancel subscription ──────────────────────────────────────── */}
      {cancelOpen && (
        <Modal title="Cancel subscription" onClose={() => !cancelSubmitting && setCancelOpen(false)}>
          <p className="text-sm text-slate-600">
            Your access continues until the current period ends, then the account is downgraded.
          </p>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason (optional)"
            rows={3}
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-emerald-400 focus:ring"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCancelOpen(false)}
              disabled={cancelSubmitting}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Keep subscription
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelSubmitting}
              className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {cancelSubmitting ? 'Cancelling...' : 'Cancel subscription'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
