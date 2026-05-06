import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBusinessContext } from '../features/context/business-context'
import {
  approveExpense,
  createExpense,
  createExpenseCategory,
  deleteExpense,
  fetchExpenseCategories,
  fetchExpenses,
  fetchExpenseSummary,
  rejectExpense,
  updateExpenseCategory,
  updateExpense,
  type Expense,
  type ExpenseCategory,
  type ExpensePaymentMethod,
  type ExpenseStatus,
  type ExpenseSummary,
} from '../features/expenses/expenses-api'
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
import { ConfirmModal, type ConfirmState } from '../features/ui/confirm-modal'
import { Modal } from '../features/ui/modal'
import { useToast } from '../features/ui/toast-context'
import { formatCurrency } from '../lib/format'

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function monthStartIsoDate(): string {
  const date = new Date()
  date.setDate(1)
  return date.toISOString().slice(0, 10)
}

export function ExpensesPage() {
  const { selectedContext } = useBusinessContext()
  const { pushToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('categoryId') ?? '')
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | 'ALL'>(
    (searchParams.get('status') as ExpenseStatus | 'ALL' | null) ?? 'ALL',
  )
  const [fromDate, setFromDate] = useState(searchParams.get('fromDate') ?? monthStartIsoDate())
  const [toDate, setToDate] = useState(searchParams.get('toDate') ?? todayIsoDate())
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '0') || 0)
  const [size, setSize] = useState(Number(searchParams.get('size') ?? '20') || 20)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [summary, setSummary] = useState<ExpenseSummary>({
    totalAmount: 0,
    approvedAmount: 0,
    pendingAmount: 0,
    rejectedAmount: 0,
  })

  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [categorySubmitting, setCategorySubmitting] = useState(false)
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    accountCode: '',
  })
  const [editCategoryModalOpen, setEditCategoryModalOpen] = useState(false)
  const [editCategorySubmitting, setEditCategorySubmitting] = useState(false)
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null)
  const [editCategoryForm, setEditCategoryForm] = useState({
    name: '',
    description: '',
    accountCode: '',
    isActive: true,
  })

  const [createExpenseModalOpen, setCreateExpenseModalOpen] = useState(false)
  const [createExpenseSubmitting, setCreateExpenseSubmitting] = useState(false)
  const [createExpenseForm, setCreateExpenseForm] = useState({
    categoryId: '',
    amount: '',
    description: '',
    expenseDate: todayIsoDate(),
    paymentMethod: 'CASH' as ExpensePaymentMethod,
    reference: '',
    receiptUrl: '',
  })

  const [editExpenseModalOpen, setEditExpenseModalOpen] = useState(false)
  const [editExpenseSubmitting, setEditExpenseSubmitting] = useState(false)
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null)
  const [editExpenseForm, setEditExpenseForm] = useState({
    categoryId: '',
    amount: '',
    description: '',
    expenseDate: todayIsoDate(),
    paymentMethod: 'CASH' as ExpensePaymentMethod,
    reference: '',
    receiptUrl: '',
  })

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  // JE state — Dr Expense / Cr Cash after approval
  const [jeExpense, setJeExpense] = useState<{ amount: number; description: string } | null>(null)
  const [journals, setJournals] = useState<JournalResponse[]>([])
  const [expenseAccounts, setExpenseAccounts] = useState<AccountResponse[]>([])
  const [assetAccounts, setAssetAccounts] = useState<AccountResponse[]>([])
  const [jeJournalId, setJeJournalId] = useState('')
  const [jeDebitId, setJeDebitId] = useState('')
  const [jeCreditId, setJeCreditId] = useState('')
  const [jeSubmitting, setJeSubmitting] = useState(false)

  useEffect(() => {
    const next = new URLSearchParams()
    if (categoryFilter) next.set('categoryId', categoryFilter)
    if (statusFilter !== 'ALL') next.set('status', statusFilter)
    if (fromDate !== monthStartIsoDate()) next.set('fromDate', fromDate)
    if (toDate !== todayIsoDate()) next.set('toDate', toDate)
    if (page !== 0) next.set('page', String(page))
    if (size !== 20) next.set('size', String(size))
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [categoryFilter, fromDate, page, searchParams, setSearchParams, size, statusFilter, toDate])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const [categoryRows, expensesPage, summaryRow] = await Promise.all([
          fetchExpenseCategories(false),
          fetchExpenses({
            branchId: selectedContext?.branchId,
            categoryId: categoryFilter || undefined,
            status: statusFilter === 'ALL' ? undefined : statusFilter,
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            page,
            size,
          }),
          fetchExpenseSummary({
            branchId: selectedContext?.branchId,
            categoryId: categoryFilter || undefined,
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
          }),
        ])
        if (cancelled) return
        setCategories(categoryRows)
        setExpenses(expensesPage.content)
        setTotalPages(expensesPage.totalPages)
        setTotalElements(expensesPage.totalElements)
        setSummary(summaryRow)
      } catch (err) {
        if (!cancelled) pushToast('error', err instanceof Error ? err.message : 'Failed to load expenses')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [categoryFilter, fromDate, page, refreshKey, selectedContext?.branchId, size, statusFilter, toDate, pushToast])

  const activeCategories = useMemo(() => categories.filter((category) => category.isActive), [categories])
  const pendingCount = useMemo(() => expenses.filter((expense) => expense.status === 'PENDING').length, [expenses])
  const resetCreateExpenseForm = () => {
    setCreateExpenseForm({
      categoryId: '',
      amount: '',
      description: '',
      expenseDate: todayIsoDate(),
      paymentMethod: 'CASH',
      reference: '',
      receiptUrl: '',
    })
  }

  const openEditExpenseModal = (expense: Expense) => {
    setEditExpenseId(expense.id)
    setEditExpenseForm({
      categoryId: expense.categoryId ?? '',
      amount: String(expense.amount ?? ''),
      description: expense.description ?? '',
      expenseDate: expense.expenseDate ?? todayIsoDate(),
      paymentMethod: expense.paymentMethod ?? 'CASH',
      reference: expense.reference ?? '',
      receiptUrl: expense.receiptUrl ?? '',
    })
    setEditExpenseModalOpen(true)
  }

  const submitCategoryCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!categoryForm.name.trim()) {
      pushToast('error', 'Category name is required.')
      return
    }
    setCategorySubmitting(true)
    try {
      await createExpenseCategory({
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || undefined,
        accountCode: categoryForm.accountCode.trim() || undefined,
      })
      setCategoryModalOpen(false)
      setCategoryForm({ name: '', description: '', accountCode: '' })
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Expense category created successfully.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to create expense category')
    } finally {
      setCategorySubmitting(false)
    }
  }

  const openEditCategoryModal = (category: ExpenseCategory) => {
    setEditCategoryId(category.id)
    setEditCategoryForm({
      name: category.name ?? '',
      description: category.description ?? '',
      accountCode: category.accountCode ?? '',
      isActive: category.isActive,
    })
    setEditCategoryModalOpen(true)
  }

  const submitCategoryEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editCategoryId) return
    if (!editCategoryForm.name.trim()) {
      pushToast('error', 'Category name is required.')
      return
    }
    setEditCategorySubmitting(true)
    try {
      await updateExpenseCategory(editCategoryId, {
        name: editCategoryForm.name.trim(),
        description: editCategoryForm.description.trim() || undefined,
        accountCode: editCategoryForm.accountCode.trim() || undefined,
        isActive: editCategoryForm.isActive,
      })
      setEditCategoryModalOpen(false)
      setEditCategoryId(null)
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Expense category updated successfully.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to update expense category')
    } finally {
      setEditCategorySubmitting(false)
    }
  }

  const handleDeactivateCategory = (category: ExpenseCategory) => {
    if (!category.isActive) return
    setConfirmState({
      title: 'Deactivate category',
      message: `Deactivate category "${category.name}"?`,
      confirmLabel: 'Deactivate',
      destructive: true,
      onConfirm: async () => {
        try {
          await updateExpenseCategory(category.id, { isActive: false })
          setRefreshKey((value) => value + 1)
          pushToast('success', `Category "${category.name}" deactivated.`)
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to deactivate category')
        }
        setConfirmState(null)
      },
    })
  }

  const submitExpenseCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!createExpenseForm.categoryId) {
      pushToast('error', 'Category is required.')
      return
    }
    const amount = Number(createExpenseForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      pushToast('error', 'Amount must be a positive number.')
      return
    }
    if (!selectedContext?.branchId) {
      pushToast('error', 'Select a branch context before creating an expense.')
      return
    }
    setCreateExpenseSubmitting(true)
    try {
      await createExpense({
        branchId: selectedContext.branchId,
        categoryId: createExpenseForm.categoryId,
        amount,
        description: createExpenseForm.description.trim() || undefined,
        expenseDate: createExpenseForm.expenseDate,
        paymentMethod: createExpenseForm.paymentMethod,
        reference: createExpenseForm.reference.trim() || undefined,
        receiptUrl: createExpenseForm.receiptUrl.trim() || undefined,
      })
      setCreateExpenseModalOpen(false)
      resetCreateExpenseForm()
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Expense created successfully.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to create expense')
    } finally {
      setCreateExpenseSubmitting(false)
    }
  }

  const submitExpenseEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editExpenseId) return
    if (!editExpenseForm.categoryId) {
      pushToast('error', 'Category is required.')
      return
    }
    const amount = Number(editExpenseForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      pushToast('error', 'Amount must be a positive number.')
      return
    }
    setEditExpenseSubmitting(true)
    try {
      await updateExpense(editExpenseId, {
        categoryId: editExpenseForm.categoryId,
        amount,
        description: editExpenseForm.description.trim() || undefined,
        expenseDate: editExpenseForm.expenseDate,
        paymentMethod: editExpenseForm.paymentMethod,
        reference: editExpenseForm.reference.trim() || undefined,
        receiptUrl: editExpenseForm.receiptUrl.trim() || undefined,
      })
      setEditExpenseModalOpen(false)
      setEditExpenseId(null)
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Expense updated successfully.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to update expense')
    } finally {
      setEditExpenseSubmitting(false)
    }
  }

  const handleApprove = async (expense: Expense) => {
    try {
      await approveExpense(expense.id)
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Expense approved.')

      // Load accounting resources and open JE modal
      const [journalList, expList, assetList] = await Promise.all([
        fetchJournals().catch(() => [] as JournalResponse[]),
        fetchAccountsByType('EXPENSE').catch(() => [] as AccountResponse[]),
        fetchAccountsByType('ASSET').catch(() => [] as AccountResponse[]),
      ])
      setJournals(journalList)
      setExpenseAccounts(expList)
      setAssetAccounts(assetList)
      setJeJournalId(journalList[0]?.id ?? '')
      setJeDebitId(expList[0]?.id ?? '')
      setJeCreditId(assetList[0]?.id ?? '')
      setJeExpense({
        amount: expense.amount,
        description: expense.description ?? expense.categoryName ?? 'Expense',
      })
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to approve expense')
    }
  }

  const handleSubmitExpenseJE = async () => {
    if (!jeExpense || !jeJournalId || !jeDebitId || !jeCreditId) return
    setJeSubmitting(true)
    try {
      const entry = await createJournalEntry({
        journalId: jeJournalId,
        branchId: selectedContext?.branchId,
        entryDate: new Date().toISOString(),
        description: `Expense approved — ${jeExpense.description}`,
        referenceType: 'MANUAL',
        lines: [
          {
            accountId: jeDebitId,
            description: jeExpense.description,
            debitAmount: jeExpense.amount,
            creditAmount: 0,
          },
          {
            accountId: jeCreditId,
            description: 'Cash / bank payment',
            debitAmount: 0,
            creditAmount: jeExpense.amount,
          },
        ],
      })
      await postJournalEntry(entry.id)
      pushToast('success', `Journal entry ${entry.entryNumber} posted`)
      setJeExpense(null)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to post journal entry')
    } finally {
      setJeSubmitting(false)
    }
  }

  const handleReject = async (expense: Expense) => {
    try {
      await rejectExpense(expense.id)
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Expense rejected.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to reject expense')
    }
  }

  const handleDelete = (expense: Expense) => {
    setConfirmState({
      title: 'Delete expense',
      message: 'Delete this pending expense?',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteExpense(expense.id)
          setRefreshKey((value) => value + 1)
          pushToast('success', 'Expense deleted.')
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to delete expense')
        }
        setConfirmState(null)
      },
    })
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Finance</p>
          <h2 className="font-display text-xl text-slate-900">Expenses</h2>
          <p className="text-sm text-slate-500">
            Total: {totalElements} | Pending on page: {pendingCount}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoryModalOpen(true)}
            className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Add Category
          </button>
          <button
            type="button"
            onClick={() => setCreateExpenseModalOpen(true)}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Add Expense
          </button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-5">
        <select
          aria-label="Filter by category"
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(event.target.value)
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as ExpenseStatus | 'ALL')
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <input
          aria-label="From date"
          type="date"
          value={fromDate}
          onChange={(event) => {
            setFromDate(event.target.value)
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <input
          aria-label="To date"
          type="date"
          value={toDate}
          onChange={(event) => {
            setToDate(event.target.value)
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <select
          aria-label="Rows per page"
          value={size}
          onChange={(event) => {
            setSize(Number(event.target.value))
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value={10}>10 rows</option>
          <option value={20}>20 rows</option>
          <option value={30}>30 rows</option>
          <option value={50}>50 rows</option>
        </select>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-600">Range Total</p>
          <p className="font-display text-2xl text-slate-900">{formatCurrency(summary.totalAmount)}</p>
        </article>
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-800">Approved</p>
          <p className="font-display text-2xl text-emerald-900">
            {formatCurrency(summary.approvedAmount)}
          </p>
        </article>
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">Pending</p>
          <p className="font-display text-2xl text-amber-900">{formatCurrency(summary.pendingAmount)}</p>
        </article>
        <article className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs text-rose-700">Rejected</p>
          <p className="font-display text-2xl text-rose-800">{formatCurrency(summary.rejectedAmount)}</p>
        </article>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading expenses...</p> : null}

      {!loading ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-500">Expense Categories</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">Name</th>
                    <th className="px-2 py-2 font-medium">Account Code</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id} className="border-b border-slate-100">
                      <td className="px-2 py-2 font-medium text-slate-700">{category.name}</td>
                      <td className="px-2 py-2 text-slate-600">{category.accountCode || '-'}</td>
                      <td className="px-2 py-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            category.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {category.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditCategoryModal(category)}
                            className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeactivateCategory(category)}
                            disabled={!category.isActive}
                            className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                          >
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Category</th>
                  <th className="px-2 py-2 font-medium">Amount</th>
                  <th className="px-2 py-2 font-medium">Method</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => {
                  const isPending = expense.status === 'PENDING'
                  return (
                    <tr key={expense.id} className="border-b border-slate-100">
                      <td className="px-2 py-3 text-slate-700">{expense.expenseDate}</td>
                      <td className="px-2 py-3 text-slate-700">{expense.categoryName || '-'}</td>
                      <td className="px-2 py-3 font-medium text-slate-800">{formatCurrency(expense.amount)}</td>
                      <td className="px-2 py-3 text-slate-700">{expense.paymentMethod}</td>
                      <td className="px-2 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            expense.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : expense.status === 'REJECTED'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {expense.status}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditExpenseModal(expense)}
                            disabled={!isPending}
                            className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApprove(expense)}
                            disabled={!isPending}
                            className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(expense)}
                            disabled={!isPending}
                            className="rounded-lg border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(expense)}
                            disabled={!isPending}
                            className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <p className="text-slate-600">
              Total: {totalElements} | Page {totalPages === 0 ? 0 : page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                disabled={page === 0}
                className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => (prev + 1 < totalPages ? prev + 1 : prev))}
                disabled={page + 1 >= totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {categoryModalOpen ? (
        <Modal title="Create Expense Category" onClose={() => !categorySubmitting && setCategoryModalOpen(false)}>
          <form className="space-y-3" onSubmit={submitCategoryCreate}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={categoryForm.name}
                onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Category name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={categoryForm.accountCode}
                onChange={(event) => setCategoryForm((prev) => ({ ...prev, accountCode: event.target.value }))}
                placeholder="Account code"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <textarea
                value={categoryForm.description}
                onChange={(event) => setCategoryForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Description"
                rows={3}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                disabled={categorySubmitting}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={categorySubmitting}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {categorySubmitting ? 'Creating...' : 'Create Category'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editCategoryModalOpen ? (
        <Modal title="Edit Expense Category" onClose={() => !editCategorySubmitting && setEditCategoryModalOpen(false)}>
          <form className="space-y-3" onSubmit={submitCategoryEdit}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={editCategoryForm.name}
                onChange={(event) => setEditCategoryForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Category name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editCategoryForm.accountCode}
                onChange={(event) => setEditCategoryForm((prev) => ({ ...prev, accountCode: event.target.value }))}
                placeholder="Account code"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <textarea
                value={editCategoryForm.description}
                onChange={(event) => setEditCategoryForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Description"
                rows={3}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={editCategoryForm.isActive}
                  onChange={(event) => setEditCategoryForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
                Category active
              </label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditCategoryModalOpen(false)}
                disabled={editCategorySubmitting}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editCategorySubmitting}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {editCategorySubmitting ? 'Saving...' : 'Save Category'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {createExpenseModalOpen ? (
        <Modal title="Create Expense" onClose={() => !createExpenseSubmitting && setCreateExpenseModalOpen(false)}>
          <form className="space-y-3" onSubmit={submitExpenseCreate}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                aria-label="Category"
                value={createExpenseForm.categoryId}
                onChange={(event) => setCreateExpenseForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select category *</option>
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <input
                aria-label="Amount"
                value={createExpenseForm.amount}
                onChange={(event) => setCreateExpenseForm((prev) => ({ ...prev, amount: event.target.value }))}
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Amount *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                aria-label="Expense date"
                type="date"
                value={createExpenseForm.expenseDate}
                onChange={(event) => setCreateExpenseForm((prev) => ({ ...prev, expenseDate: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                aria-label="Payment method"
                value={createExpenseForm.paymentMethod}
                onChange={(event) =>
                  setCreateExpenseForm((prev) => ({ ...prev, paymentMethod: event.target.value as ExpensePaymentMethod }))
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="CASH">CASH</option>
                <option value="BANK">BANK</option>
                <option value="MOBILE_MONEY">MOBILE_MONEY</option>
              </select>
              <input
                value={createExpenseForm.reference}
                onChange={(event) => setCreateExpenseForm((prev) => ({ ...prev, reference: event.target.value }))}
                placeholder="Reference"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={createExpenseForm.receiptUrl}
                onChange={(event) => setCreateExpenseForm((prev) => ({ ...prev, receiptUrl: event.target.value }))}
                placeholder="Receipt URL"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <textarea
                value={createExpenseForm.description}
                onChange={(event) => setCreateExpenseForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Description"
                rows={3}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateExpenseModalOpen(false)}
                disabled={createExpenseSubmitting}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createExpenseSubmitting}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {createExpenseSubmitting ? 'Creating...' : 'Create Expense'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editExpenseModalOpen ? (
        <Modal title="Edit Expense" onClose={() => !editExpenseSubmitting && setEditExpenseModalOpen(false)}>
          <form className="space-y-3" onSubmit={submitExpenseEdit}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                aria-label="Category"
                value={editExpenseForm.categoryId}
                onChange={(event) => setEditExpenseForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select category *</option>
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <input
                aria-label="Amount"
                value={editExpenseForm.amount}
                onChange={(event) => setEditExpenseForm((prev) => ({ ...prev, amount: event.target.value }))}
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Amount *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                aria-label="Expense date"
                type="date"
                value={editExpenseForm.expenseDate}
                onChange={(event) => setEditExpenseForm((prev) => ({ ...prev, expenseDate: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                aria-label="Payment method"
                value={editExpenseForm.paymentMethod}
                onChange={(event) =>
                  setEditExpenseForm((prev) => ({ ...prev, paymentMethod: event.target.value as ExpensePaymentMethod }))
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="CASH">CASH</option>
                <option value="BANK">BANK</option>
                <option value="MOBILE_MONEY">MOBILE_MONEY</option>
              </select>
              <input
                value={editExpenseForm.reference}
                onChange={(event) => setEditExpenseForm((prev) => ({ ...prev, reference: event.target.value }))}
                placeholder="Reference"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editExpenseForm.receiptUrl}
                onChange={(event) => setEditExpenseForm((prev) => ({ ...prev, receiptUrl: event.target.value }))}
                placeholder="Receipt URL"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <textarea
                value={editExpenseForm.description}
                onChange={(event) => setEditExpenseForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Description"
                rows={3}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditExpenseModalOpen(false)}
                disabled={editExpenseSubmitting}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editExpenseSubmitting}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {editExpenseSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {confirmState ? (
        <ConfirmModal
          {...confirmState}
          onClose={() => setConfirmState(null)}
        />
      ) : null}

      {/* JE modal — Dr Expense / Cr Cash after approval */}
      {jeExpense ? (
        <Modal
          title="Record expense in accounting"
          onClose={() => !jeSubmitting && setJeExpense(null)}
        >
          <p className="text-sm text-slate-600">
            Expense <strong>{jeExpense.description}</strong> ({formatCurrency(jeExpense.amount)}) has
            been approved. Post the journal entry to keep your books current.
          </p>
          <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Dr Expense Account &nbsp;/&nbsp; Cr Cash / Bank
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
                    <td className="px-3 py-2 text-xs font-semibold text-slate-500">Dr (Expense)</td>
                    <td className="px-3 py-2">
                      <select
                        aria-label="Debit account (Expense)"
                        value={jeDebitId}
                        onChange={(e) => setJeDebitId(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      >
                        <option value="">— select account —</option>
                        {expenseAccounts.filter((a) => a.isActive).map((a) => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-800">
                      {formatCurrency(jeExpense.amount)}
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
                      {formatCurrency(jeExpense.amount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setJeExpense(null)}
              disabled={jeSubmitting}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleSubmitExpenseJE}
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
