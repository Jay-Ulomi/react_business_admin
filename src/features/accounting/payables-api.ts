import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type PayablePaymentResponse = {
  id: string
  amount: number
  paymentDate: string
  paymentMethod: string
  reference?: string
  createdAt?: string
}

export type PayableResponse = {
  id: string
  businessId: string
  supplierId: string
  purchaseId?: string
  amount: number
  paidAmount: number
  balance: number
  dueDate: string
  status: string
  payments?: PayablePaymentResponse[]
  createdAt?: string
  updatedAt?: string
}

export type CreatePayableRequest = {
  supplierId: string
  purchaseId?: string
  amount: number
  dueDate: string
}

export type RecordPayablePaymentRequest = {
  amount: number
  paymentDate: string
  paymentMethod: string
  reference?: string
}

export async function fetchPayables(params: {
  supplierId?: string
  page?: number
  size?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}): Promise<SpringPage<PayableResponse>> {
  const query = new URLSearchParams()
  if (params.supplierId) query.set('supplierId', params.supplierId)
  query.set('page', String(params.page ?? 0))
  query.set('size', String(params.size ?? 20))
  query.set('sort', `${params.sortBy ?? 'dueDate'},${params.sortDir ?? 'asc'}`)
  return apiRequest<SpringPage<PayableResponse>>(
    `/api/accounting/payables?${query.toString()}`,
  )
}

export async function fetchOverduePayables(): Promise<PayableResponse[]> {
  return apiRequest<PayableResponse[]>('/api/accounting/payables/overdue')
}

export async function createPayable(payload: CreatePayableRequest): Promise<PayableResponse> {
  return apiRequest<PayableResponse>('/api/accounting/payables', {
    method: 'POST',
    body: payload,
  })
}

export async function recordPayablePayment(
  payableId: string,
  payload: RecordPayablePaymentRequest,
): Promise<PayableResponse> {
  return apiRequest<PayableResponse>(`/api/accounting/payables/${payableId}/payments`, {
    method: 'POST',
    body: payload,
  })
}
