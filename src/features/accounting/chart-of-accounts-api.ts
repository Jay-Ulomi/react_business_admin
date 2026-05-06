import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'

export type AccountResponse = {
  id: string
  businessId: string
  accountGroupId?: string
  accountGroupName?: string
  code: string
  name: string
  description?: string
  accountType: AccountType
  isActive: boolean
  isSystemAccount: boolean
  currentBalance?: number
  createdAt?: string
  updatedAt?: string
}

export type CreateAccountRequest = {
  accountGroupId?: string
  code: string
  name: string
  description?: string
  accountType: AccountType
  isSystemAccount?: boolean
}

export type UpdateAccountRequest = {
  accountGroupId?: string
  name?: string
  description?: string
  accountType?: AccountType
  isActive?: boolean
}

export type AccountGroupResponse = {
  id: string
  businessId: string
  name: string
  type: AccountType
  parentGroupId?: string
  parentGroupName?: string
  sortOrder?: number
  isActive: boolean
  childGroups?: AccountGroupResponse[]
  createdAt?: string
  updatedAt?: string
}

export async function fetchAccounts(params: {
  search?: string
  accountType?: AccountType
  isActive?: boolean
  page?: number
  size?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}): Promise<SpringPage<AccountResponse>> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.accountType) query.set('accountType', params.accountType)
  if (params.isActive !== undefined) query.set('isActive', String(params.isActive))
  query.set('page', String(params.page ?? 0))
  query.set('size', String(params.size ?? 50))
  query.set('sort', `${params.sortBy ?? 'code'},${params.sortDir ?? 'asc'}`)
  return apiRequest<SpringPage<AccountResponse>>(`/api/accounting/accounts?${query.toString()}`)
}

export async function fetchAccountsByType(accountType: AccountType): Promise<AccountResponse[]> {
  return apiRequest<AccountResponse[]>(`/api/accounting/accounts/type/${accountType}`)
}

export async function createAccount(payload: CreateAccountRequest): Promise<AccountResponse> {
  return apiRequest<AccountResponse>('/api/accounting/accounts', {
    method: 'POST',
    body: payload,
  })
}

export async function updateAccount(
  accountId: string,
  payload: UpdateAccountRequest,
): Promise<AccountResponse> {
  return apiRequest<AccountResponse>(`/api/accounting/accounts/${accountId}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function deactivateAccount(accountId: string): Promise<void> {
  await apiRequest<void>(`/api/accounting/accounts/${accountId}`, {
    method: 'DELETE',
  })
}

export async function seedDefaultAccounts(): Promise<void> {
  await apiRequest<void>('/api/accounting/accounts/seed-defaults', {
    method: 'POST',
  })
}

export async function fetchAccountGroups(): Promise<AccountGroupResponse[]> {
  return apiRequest<AccountGroupResponse[]>('/api/accounting/account-groups')
}

export async function fetchAccountGroupTree(): Promise<AccountGroupResponse[]> {
  return apiRequest<AccountGroupResponse[]>('/api/accounting/account-groups/tree')
}
