import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type CustomerType = 'INDIVIDUAL' | 'COMPANY'

export type CustomerResponse = {
  id: string
  businessId: string
  code?: string
  name: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  country?: string
  taxId?: string
  customerType?: CustomerType
  creditLimit?: number
  currentBalance?: number
  loyaltyPoints?: number
  customerGroupId?: string
  isActive: boolean
  notes?: string
  dateOfBirth?: string
  gender?: string
  createdAt?: string
  updatedAt?: string
}

export type CreateCustomerRequest = {
  code?: string
  name: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  country?: string
  taxId?: string
  customerType?: CustomerType
  creditLimit?: number
  loyaltyPoints?: number
  customerGroupId?: string
  notes?: string
  dateOfBirth?: string
  gender?: string
}

export type UpdateCustomerRequest = {
  name?: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  country?: string
  taxId?: string
  customerType?: CustomerType
  creditLimit?: number
  loyaltyPoints?: number
  customerGroupId?: string
  isActive?: boolean
  notes?: string
  dateOfBirth?: string
  gender?: string
}

export async function fetchCustomers(params: {
  search?: string
  customerGroupId?: string
  isActive?: boolean
  page?: number
  size?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}): Promise<SpringPage<CustomerResponse>> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.customerGroupId) query.set('customerGroupId', params.customerGroupId)
  if (params.isActive !== undefined) query.set('isActive', String(params.isActive))
  query.set('page', String(params.page ?? 0))
  query.set('size', String(params.size ?? 20))
  query.set('sort', `${params.sortBy ?? 'updatedAt'},${params.sortDir ?? 'desc'}`)
  return apiRequest<SpringPage<CustomerResponse>>(`/api/customers?${query.toString()}`)
}

export async function fetchCustomer(customerId: string): Promise<CustomerResponse> {
  return apiRequest<CustomerResponse>(`/api/customers/${customerId}`)
}

export async function createCustomer(payload: CreateCustomerRequest): Promise<CustomerResponse> {
  return apiRequest<CustomerResponse>('/api/customers', {
    method: 'POST',
    body: payload,
  })
}

export async function updateCustomer(
  customerId: string,
  payload: UpdateCustomerRequest,
): Promise<CustomerResponse> {
  return apiRequest<CustomerResponse>(`/api/customers/${customerId}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function deactivateCustomer(customerId: string): Promise<void> {
  await apiRequest<void>(`/api/customers/${customerId}`, {
    method: 'DELETE',
  })
}

export async function adjustLoyaltyPoints(
  customerId: string,
  delta: number,
): Promise<CustomerResponse> {
  return apiRequest<CustomerResponse>(
    `/api/customers/${customerId}/loyalty-points?delta=${encodeURIComponent(String(delta))}`,
    { method: 'POST' },
  )
}

export async function adjustCustomerBalance(
  customerId: string,
  delta: number,
): Promise<CustomerResponse> {
  return apiRequest<CustomerResponse>(
    `/api/customers/${customerId}/balance?delta=${encodeURIComponent(String(delta))}`,
    { method: 'POST' },
  )
}
