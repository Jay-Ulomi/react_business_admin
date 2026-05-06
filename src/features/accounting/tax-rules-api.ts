import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type TaxRuleResponse = {
  id: string
  businessId: string
  name: string
  rate: number
  code: string
  description?: string
  isActive: boolean
  isDefault: boolean
  isCompound: boolean
  createdAt?: string
  updatedAt?: string
}

export type CreateTaxRuleRequest = {
  name: string
  rate: number
  code: string
  description?: string
  isDefault?: boolean
  isCompound?: boolean
}

export type UpdateTaxRuleRequest = {
  name?: string
  rate?: number
  code?: string
  description?: string
  isActive?: boolean
  isDefault?: boolean
  isCompound?: boolean
}

export async function fetchTaxRules(params: {
  page?: number
  size?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}): Promise<SpringPage<TaxRuleResponse>> {
  const query = new URLSearchParams()
  query.set('page', String(params.page ?? 0))
  query.set('size', String(params.size ?? 20))
  query.set('sort', `${params.sortBy ?? 'name'},${params.sortDir ?? 'asc'}`)
  return apiRequest<SpringPage<TaxRuleResponse>>(
    `/api/accounting/taxes/rules?${query.toString()}`,
  )
}

export async function createTaxRule(payload: CreateTaxRuleRequest): Promise<TaxRuleResponse> {
  return apiRequest<TaxRuleResponse>('/api/accounting/taxes/rules', {
    method: 'POST',
    body: payload,
  })
}

export async function updateTaxRule(
  ruleId: string,
  payload: UpdateTaxRuleRequest,
): Promise<TaxRuleResponse> {
  return apiRequest<TaxRuleResponse>(`/api/accounting/taxes/rules/${ruleId}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function deactivateTaxRule(ruleId: string): Promise<void> {
  await apiRequest<void>(`/api/accounting/taxes/rules/${ruleId}`, {
    method: 'DELETE',
  })
}
