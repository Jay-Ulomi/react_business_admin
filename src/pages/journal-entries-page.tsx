import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  createJournalEntry,
  fetchJournalEntries,
  fetchJournalEntry,
  fetchJournals,
  postJournalEntry,
  reverseJournalEntry,
  type JournalEntryLineRequest,
  type JournalEntryResponse,
  type JournalEntryStatus,
  type JournalResponse,
} from '../features/accounting/journal-entries-api'
import {
  fetchAccounts,
  type AccountResponse,
} from '../features/accounting/chart-of-accounts-api'
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

function toInstant(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00.000Z`).toISOString()
}

function formatInstant(value: string | undefined): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

type DraftLine = {
  key: string
  accountId: string
  description: string
  debitAmount: string
  creditAmount: string
}

function emptyLine(): DraftLine {
  return {
    key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    accountId: '',
    description: '',
    debitAmount: '',
    creditAmount: '',
  }
}

export function JournalEntriesPage() {
  const { pushToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [entries, setEntries] = useState<JournalEntryResponse[]>([])
  const [journals, setJournals] = useState<JournalResponse[]>([])
  const [accounts, setAccounts] = useState<AccountResponse[]>([])

  const [statusFilter, setStatusFilter] = useState<JournalEntryStatus | 'ALL'>(
    (searchParams.get('status') as JournalEntryStatus | 'ALL' | null) ?? 'ALL',
  )
  const [journalFilter, setJournalFilter] = useState(searchParams.get('journalId') ?? '')
  const [fromDate, setFromDate] = useState(searchParams.get('fromDate') ?? monthStartIsoDate())
  const [toDate, setToDate] = useState(searchParams.get('toDate') ?? todayIsoDate())
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '0') || 0)
  const [size, setSize] = useState(Number(searchParams.get('size') ?? '20') || 20)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailEntry, setDetailEntry] = useState<JournalEntryResponse | null>(null)

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createJournalId, setCreateJournalId] = useState('')
  const [createDate, setCreateDate] = useState(todayIsoDate())
  const [createDescription, setCreateDescription] = useState('')
  const [createLines, setCreateLines] = useState<DraftLine[]>([emptyLine(), emptyLine()])

  useEffect(() => {
    const next = new URLSearchParams()
    if (statusFilter !== 'ALL') next.set('status', statusFilter)
    if (journalFilter) next.set('journalId', journalFilter)
    if (fromDate !== monthStartIsoDate()) next.set('fromDate', fromDate)
    if (toDate !== todayIsoDate()) next.set('toDate', toDate)
    if (page !== 0) next.set('page', String(page))
    if (size !== 20) next.set('size', String(size))
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [statusFilter, journalFilter, fromDate, toDate, page, size, searchParams, setSearchParams])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const [entriesPage, journalList, accountsPage] = await Promise.all([
          fetchJournalEntries({
            status: statusFilter === 'ALL' ? undefined : statusFilter,
            journalId: journalFilter || undefined,
            startDate: fromDate ? toInstant(fromDate) : undefined,
            endDate: toDate ? toInstant(toDate) : undefined,
            page,
            size,
          }),
          fetchJournals().catch(() => [] as JournalResponse[]),
          fetchAccounts({ isActive: true, page: 0, size: 500, sortBy: 'code', sortDir: 'asc' }),
        ])
        if (cancelled) return
        setEntries(entriesPage.content)
        setTotalPages(entriesPage.totalPages)
        setTotalElements(entriesPage.totalElements)
        setJournals(journalList)
        setAccounts(accountsPage.content)
      } catch (err) {
        if (!cancelled)
          pushToast('error', err instanceof Error ? err.message : 'Failed to load journal entries')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [statusFilter, journalFilter, fromDate, toDate, page, size, refreshKey, pushToast])

  const totals = useMemo(() => {
    let debit = 0
    let credit = 0
    for (const line of createLines) {
      debit += Number(line.debitAmount) || 0
      credit += Number(line.creditAmount) || 0
    }
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.01 && debit > 0 }
  }, [createLines])

  const openDetail = async (entryId: string) => {
    setDetailOpen(true)
    setDetailEntry(null)
    setDetailLoading(true)
    try {
      const entry = await fetchJournalEntry(entryId)
      setDetailEntry(entry)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to load entry detail')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const resetCreate = () => {
    setCreateJournalId('')
    setCreateDate(todayIsoDate())
    setCreateDescription('')
    setCreateLines([emptyLine(), emptyLine()])
  }

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setCreateLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  const addLine = () => setCreateLines((prev) => [...prev, emptyLine()])
  const removeLine = (key: string) => {
    setCreateLines((prev) => (prev.length > 2 ? prev.filter((line) => line.key !== key) : prev))
  }

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!createJournalId) {
      pushToast('error', 'Journal is required.')
      return
    }
    const lines: JournalEntryLineRequest[] = []
    for (const draft of createLines) {
      if (!draft.accountId) continue
      const debit = Number(draft.debitAmount) || 0
      const credit = Number(draft.creditAmount) || 0
      if (debit === 0 && credit === 0) continue
      lines.push({
        accountId: draft.accountId,
        description: draft.description.trim() || undefined,
        debitAmount: debit,
        creditAmount: credit,
      })
    }
    if (lines.length < 2) {
      pushToast('error', 'At least two lines with accounts and amounts are required.')
      return
    }
    if (!totals.balanced) {
      pushToast('error', 'Debits and credits must balance.')
      return
    }
    setCreateSubmitting(true)
    try {
      await createJournalEntry({
        journalId: createJournalId,
        entryDate: toInstant(createDate),
        description: createDescription.trim() || undefined,
        referenceType: 'MANUAL',
        lines,
      })
      setCreateOpen(false)
      resetCreate()
      setRefreshKey((v) => v + 1)
      pushToast('success', 'Journal entry created.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to create entry')
    } finally {
      setCreateSubmitting(false)
    }
  }

  const handlePost = async (entry: JournalEntryResponse) => {
    try {
      await postJournalEntry(entry.id)
      setRefreshKey((v) => v + 1)
      pushToast('success', 'Entry posted.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to post entry')
    }
  }

  const handleReverse = (entry: JournalEntryResponse) => {
    setConfirmState({
      title: 'Reverse journal entry',
      message: `Reverse entry ${entry.entryNumber}? This will create a reversing entry.`,
      confirmLabel: 'Reverse',
      destructive: true,
      onConfirm: async () => {
        try {
          await reverseJournalEntry(entry.id)
          setRefreshKey((v) => v + 1)
          pushToast('success', 'Entry reversed.')
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to reverse entry')
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
          <h2 className="font-display text-xl text-slate-900">Journal Entries</h2>
          <p className="text-sm text-slate-500">Total: {totalElements} entries</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          New Manual Entry
        </button>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-5">
        <select
          value={journalFilter}
          onChange={(event) => {
            setJournalFilter(event.target.value)
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">All journals</option>
          {journals.map((journal) => (
            <option key={journal.id} value={journal.id}>
              {journal.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as JournalEntryStatus | 'ALL')
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="ALL">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="POSTED">Posted</option>
          <option value="REVERSED">Reversed</option>
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(event) => {
            setFromDate(event.target.value)
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={toDate}
          onChange={(event) => {
            setToDate(event.target.value)
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
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

      {loading ? <p className="text-sm text-slate-500">Loading entries...</p> : null}

      {!loading ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Entry #</th>
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Journal</th>
                  <th className="px-2 py-2 font-medium">Reference</th>
                  <th className="px-2 py-2 text-right font-medium">Debit</th>
                  <th className="px-2 py-2 text-right font-medium">Credit</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100">
                    <td className="px-2 py-3 font-mono text-slate-700">{entry.entryNumber}</td>
                    <td className="px-2 py-3 text-slate-700">{formatInstant(entry.entryDate)}</td>
                    <td className="px-2 py-3 text-slate-700">{entry.journalName ?? '-'}</td>
                    <td className="px-2 py-3 text-slate-600">{entry.referenceType}</td>
                    <td className="px-2 py-3 text-right font-mono text-slate-800">
                      {formatCurrency(entry.totalDebit)}
                    </td>
                    <td className="px-2 py-3 text-right font-mono text-slate-800">
                      {formatCurrency(entry.totalCredit)}
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          entry.status === 'POSTED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : entry.status === 'REVERSED'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void openDetail(entry.id)}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => void handlePost(entry)}
                          disabled={entry.status !== 'DRAFT'}
                          className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                        >
                          Post
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReverse(entry)}
                          disabled={entry.status !== 'POSTED'}
                          className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          Reverse
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-6 text-center text-sm text-slate-500">
                      No journal entries found.
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

      {detailOpen ? (
        <Modal
          title={detailEntry ? `Entry ${detailEntry.entryNumber}` : 'Journal Entry'}
          maxWidthClass="max-w-3xl"
          onClose={() => setDetailOpen(false)}
        >
          {detailLoading ? <p className="text-sm text-slate-500">Loading...</p> : null}
          {detailEntry ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-500">Date</p>
                  <p className="font-medium text-slate-800">{formatInstant(detailEntry.entryDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Journal</p>
                  <p className="font-medium text-slate-800">{detailEntry.journalName ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <p className="font-medium text-slate-800">{detailEntry.status}</p>
                </div>
                <div className="md:col-span-3">
                  <p className="text-xs text-slate-500">Description</p>
                  <p className="text-slate-700">{detailEntry.description ?? '-'}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Code</th>
                      <th className="px-2 py-2 font-medium">Account</th>
                      <th className="px-2 py-2 font-medium">Description</th>
                      <th className="px-2 py-2 text-right font-medium">Debit</th>
                      <th className="px-2 py-2 text-right font-medium">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailEntry.lines.map((line, index) => (
                      <tr key={line.id ?? `${line.accountId}-${index}`} className="border-b border-slate-100">
                        <td className="px-2 py-2 font-mono text-slate-700">{line.accountCode ?? '-'}</td>
                        <td className="px-2 py-2 text-slate-700">{line.accountName ?? '-'}</td>
                        <td className="px-2 py-2 text-slate-600">{line.description ?? '-'}</td>
                        <td className="px-2 py-2 text-right font-mono text-slate-800">
                          {Number(line.debitAmount) > 0 ? formatCurrency(line.debitAmount) : '-'}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-slate-800">
                          {Number(line.creditAmount) > 0 ? formatCurrency(line.creditAmount) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-200 font-semibold text-slate-800">
                    <tr>
                      <td colSpan={3} className="px-2 py-2 text-right">
                        Totals
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatCurrency(detailEntry.totalDebit)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatCurrency(detailEntry.totalCredit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p
                className={`text-xs ${
                  Number(detailEntry.totalDebit) === Number(detailEntry.totalCredit)
                    ? 'text-emerald-700'
                    : 'text-rose-700'
                }`}
              >
                {Number(detailEntry.totalDebit) === Number(detailEntry.totalCredit)
                  ? 'Debits and credits balance.'
                  : 'Entry is out of balance.'}
              </p>
            </div>
          ) : null}
        </Modal>
      ) : null}

      {confirmState ? (
        <ConfirmModal
          {...confirmState}
          onClose={() => setConfirmState(null)}
        />
      ) : null}

      {createOpen ? (
        <Modal
          title="Create Manual Journal Entry"
          maxWidthClass="max-w-4xl"
          onClose={() => !createSubmitting && setCreateOpen(false)}
        >
          <form className="space-y-3" onSubmit={submitCreate}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <select
                value={createJournalId}
                onChange={(event) => setCreateJournalId(event.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select journal *</option>
                {journals.map((journal) => (
                  <option key={journal.id} value={journal.id}>
                    {journal.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={createDate}
                onChange={(event) => setCreateDate(event.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                placeholder="Description"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">Account</th>
                    <th className="px-2 py-2 font-medium">Description</th>
                    <th className="px-2 py-2 text-right font-medium">Debit</th>
                    <th className="px-2 py-2 text-right font-medium">Credit</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {createLines.map((line) => (
                    <tr key={line.key} className="border-b border-slate-100">
                      <td className="px-2 py-2">
                        <select
                          value={line.accountId}
                          onChange={(event) => updateLine(line.key, { accountId: event.target.value })}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                        >
                          <option value="">Select account</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.code} — {account.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={line.description}
                          onChange={(event) =>
                            updateLine(line.key, { description: event.target.value })
                          }
                          placeholder="Line description"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.debitAmount}
                          onChange={(event) =>
                            updateLine(line.key, {
                              debitAmount: event.target.value,
                              creditAmount: event.target.value ? '' : line.creditAmount,
                            })
                          }
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-right font-mono text-sm"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.creditAmount}
                          onChange={(event) =>
                            updateLine(line.key, {
                              creditAmount: event.target.value,
                              debitAmount: event.target.value ? '' : line.debitAmount,
                            })
                          }
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-right font-mono text-sm"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          disabled={createLines.length <= 2}
                          className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 font-semibold text-slate-800">
                  <tr>
                    <td colSpan={2} className="px-2 py-2 text-right">
                      Totals
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{formatCurrency(totals.debit)}</td>
                    <td className="px-2 py-2 text-right font-mono">{formatCurrency(totals.credit)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={addLine}
                className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                Add Line
              </button>
              <p
                className={`text-sm font-semibold ${
                  totals.balanced ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {totals.balanced ? 'Balanced' : 'Debits and credits must balance'}
              </p>
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
                {createSubmitting ? 'Creating...' : 'Create Entry'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  )
}
