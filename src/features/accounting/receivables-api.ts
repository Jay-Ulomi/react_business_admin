import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type ReceivableResponse = {
  id: string
  businessId: string
  customerId: string
  saleId: string
  amount: number
  paidAmount: number
  balance: number
  dueDate: string
  status: string
}

export async function fetchReceivables(params?: {
  customerId?: string
  page?: number
  size?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}): Promise<SpringPage<ReceivableResponse>> {
  const query = new URLSearchParams()
  if (params?.customerId) query.set('customerId', params.customerId)
  query.set('page', String(params?.page ?? 0))
  query.set('size', String(params?.size ?? 20))
  query.set('sort', `${params?.sortBy ?? 'dueDate'},${params?.sortDir ?? 'asc'}`)
  return apiRequest<SpringPage<ReceivableResponse>>(`/api/accounting/receivables?${query.toString()}`)
}

export async function fetchOverdueReceivables(): Promise<ReceivableResponse[]> {
  return apiRequest<ReceivableResponse[]>('/api/accounting/receivables/overdue')
}
