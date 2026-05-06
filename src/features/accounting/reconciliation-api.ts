import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type BankAccountResponse = {
  id: string
  businessId: string
  name: string
  bankName?: string
  accountNumber?: string
  currentBalance?: number
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export type ReconciliationResponse = {
  id: string
  businessId: string
  bankAccountId: string
  bankAccountName?: string
  startDate: string
  endDate: string
  statementBalance: number
  systemBalance?: number
  difference?: number
  status: string
  reconciledBy?: string
  reconciledAt?: string
  createdAt?: string
  updatedAt?: string
}

export type CreateReconciliationRequest = {
  bankAccountId: string
  startDate: string
  endDate: string
  statementBalance: number
}

export async function fetchBankAccounts(params?: {
  page?: number
  size?: number
}): Promise<SpringPage<BankAccountResponse>> {
  const query = new URLSearchParams()
  query.set('page', String(params?.page ?? 0))
  query.set('size', String(params?.size ?? 50))
  return apiRequest<SpringPage<BankAccountResponse>>(
    `/api/accounting/bank-accounts?${query.toString()}`,
  )
}

export async function fetchReconciliations(params: {
  bankAccountId?: string
  page?: number
  size?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}): Promise<SpringPage<ReconciliationResponse>> {
  const query = new URLSearchParams()
  if (params.bankAccountId) query.set('bankAccountId', params.bankAccountId)
  query.set('page', String(params.page ?? 0))
  query.set('size', String(params.size ?? 20))
  query.set('sort', `${params.sortBy ?? 'endDate'},${params.sortDir ?? 'desc'}`)
  return apiRequest<SpringPage<ReconciliationResponse>>(
    `/api/accounting/reconciliations?${query.toString()}`,
  )
}

export async function createReconciliation(
  payload: CreateReconciliationRequest,
): Promise<ReconciliationResponse> {
  return apiRequest<ReconciliationResponse>('/api/accounting/reconciliations', {
    method: 'POST',
    body: payload,
  })
}

export async function completeReconciliation(id: string): Promise<ReconciliationResponse> {
  return apiRequest<ReconciliationResponse>(`/api/accounting/reconciliations/${id}/complete`, {
    method: 'POST',
  })
}
