import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type ExpenseStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type ExpensePaymentMethod = 'CASH' | 'BANK' | 'MOBILE_MONEY'

export type ExpenseCategory = {
  id: string
  businessId: string
  name: string
  description?: string
  accountCode?: string
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export type Expense = {
  id: string
  businessId: string
  branchId: string
  categoryId: string
  categoryName?: string
  amount: number
  description?: string
  expenseDate: string
  paymentMethod: ExpensePaymentMethod
  reference?: string
  receiptUrl?: string
  status: ExpenseStatus
  approvedBy?: string
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}

export type ExpenseSummary = {
  totalAmount: number
  approvedAmount: number
  pendingAmount: number
  rejectedAmount: number
}

export type CreateExpenseCategoryRequest = {
  name: string
  description?: string
  accountCode?: string
}

export type UpdateExpenseCategoryRequest = {
  name?: string
  description?: string
  accountCode?: string
  isActive?: boolean
}

export type CreateExpenseRequest = {
  branchId?: string
  categoryId: string
  amount: number
  description?: string
  expenseDate: string
  paymentMethod: ExpensePaymentMethod
  reference?: string
  receiptUrl?: string
}

export type UpdateExpenseRequest = {
  categoryId?: string
  amount?: number
  description?: string
  expenseDate?: string
  paymentMethod?: ExpensePaymentMethod
  reference?: string
  receiptUrl?: string
}

export async function fetchExpenseCategories(activeOnly = false): Promise<ExpenseCategory[]> {
  const query = new URLSearchParams()
  query.set('activeOnly', String(activeOnly))
  return apiRequest<ExpenseCategory[]>(`/api/expense-categories?${query.toString()}`)
}

export async function createExpenseCategory(
  payload: CreateExpenseCategoryRequest,
): Promise<ExpenseCategory> {
  return apiRequest<ExpenseCategory>('/api/expense-categories', {
    method: 'POST',
    body: payload,
  })
}

export async function updateExpenseCategory(
  categoryId: string,
  payload: UpdateExpenseCategoryRequest,
): Promise<ExpenseCategory> {
  return apiRequest<ExpenseCategory>(`/api/expense-categories/${categoryId}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function fetchExpenses(params: {
  branchId?: string
  categoryId?: string
  status?: ExpenseStatus
  fromDate?: string
  toDate?: string
  page?: number
  size?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}): Promise<SpringPage<Expense>> {
  const query = new URLSearchParams()
  if (params.branchId) query.set('branchId', params.branchId)
  if (params.categoryId) query.set('categoryId', params.categoryId)
  if (params.status) query.set('status', params.status)
  if (params.fromDate) query.set('fromDate', params.fromDate)
  if (params.toDate) query.set('toDate', params.toDate)
  query.set('page', String(params.page ?? 0))
  query.set('size', String(params.size ?? 20))
  query.set('sort', `${params.sortBy ?? 'expenseDate'},${params.sortDir ?? 'desc'}`)

  return apiRequest<SpringPage<Expense>>(`/api/expenses?${query.toString()}`)
}

export async function fetchExpenseSummary(params: {
  branchId?: string
  categoryId?: string
  fromDate?: string
  toDate?: string
}): Promise<ExpenseSummary> {
  const query = new URLSearchParams()
  if (params.branchId) query.set('branchId', params.branchId)
  if (params.categoryId) query.set('categoryId', params.categoryId)
  if (params.fromDate) query.set('fromDate', params.fromDate)
  if (params.toDate) query.set('toDate', params.toDate)
  return apiRequest<ExpenseSummary>(`/api/expenses/summary?${query.toString()}`)
}

export async function createExpense(payload: CreateExpenseRequest): Promise<Expense> {
  return apiRequest<Expense>('/api/expenses', {
    method: 'POST',
    body: payload,
  })
}

export async function updateExpense(expenseId: string, payload: UpdateExpenseRequest): Promise<Expense> {
  return apiRequest<Expense>(`/api/expenses/${expenseId}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function approveExpense(expenseId: string): Promise<Expense> {
  return apiRequest<Expense>(`/api/expenses/${expenseId}/approve`, {
    method: 'POST',
  })
}

export async function rejectExpense(expenseId: string): Promise<Expense> {
  return apiRequest<Expense>(`/api/expenses/${expenseId}/reject`, {
    method: 'POST',
  })
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await apiRequest<void>(`/api/expenses/${expenseId}`, {
    method: 'DELETE',
  })
}
