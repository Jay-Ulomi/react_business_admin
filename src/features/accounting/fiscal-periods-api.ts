import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type FiscalPeriodStatus = 'OPEN' | 'CLOSED' | 'LOCKED'

export type FiscalPeriodResponse = {
  id: string
  businessId: string
  name: string
  startDate: string
  endDate: string
  status: FiscalPeriodStatus
  closedBy?: string | null
  closedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export type CreateFiscalPeriodRequest = {
  name: string
  startDate: string
  endDate: string
}

export async function fetchFiscalPeriods(params: {
  page?: number
  size?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}): Promise<SpringPage<FiscalPeriodResponse>> {
  const query = new URLSearchParams()
  query.set('page', String(params.page ?? 0))
  query.set('size', String(params.size ?? 20))
  query.set('sort', `${params.sortBy ?? 'startDate'},${params.sortDir ?? 'desc'}`)
  return apiRequest<SpringPage<FiscalPeriodResponse>>(
    `/api/accounting/fiscal-periods?${query.toString()}`,
  )
}

export async function createFiscalPeriod(
  payload: CreateFiscalPeriodRequest,
): Promise<FiscalPeriodResponse> {
  return apiRequest<FiscalPeriodResponse>('/api/accounting/fiscal-periods', {
    method: 'POST',
    body: payload,
  })
}

export async function closeFiscalPeriod(periodId: string): Promise<FiscalPeriodResponse> {
  return apiRequest<FiscalPeriodResponse>(`/api/accounting/fiscal-periods/${periodId}/close`, {
    method: 'POST',
  })
}

export async function reopenFiscalPeriod(periodId: string): Promise<FiscalPeriodResponse> {
  return apiRequest<FiscalPeriodResponse>(`/api/accounting/fiscal-periods/${periodId}/reopen`, {
    method: 'POST',
  })
}

export async function lockFiscalPeriod(periodId: string): Promise<FiscalPeriodResponse> {
  return apiRequest<FiscalPeriodResponse>(`/api/accounting/fiscal-periods/${periodId}/lock`, {
    method: 'POST',
  })
}
