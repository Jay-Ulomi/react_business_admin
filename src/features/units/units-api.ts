import { apiRequest } from '../../lib/http'

export type ProductUnit = {
  id: string
  businessId: string
  name: string
  abbreviation: string
  isActive: boolean
  active?: boolean
  createdAt?: string
  updatedAt?: string
}

export type CreateProductUnitRequest = {
  name: string
  abbreviation: string
}

export type UpdateProductUnitRequest = {
  name?: string
  abbreviation?: string
  isActive?: boolean
}

export async function fetchUnits(): Promise<ProductUnit[]> {
  return apiRequest<ProductUnit[]>('/api/units')
}

export async function createUnit(payload: CreateProductUnitRequest): Promise<ProductUnit> {
  return apiRequest<ProductUnit>('/api/units', {
    method: 'POST',
    body: payload,
  })
}

export async function updateUnit(unitId: string, payload: UpdateProductUnitRequest): Promise<ProductUnit> {
  return apiRequest<ProductUnit>(`/api/units/${unitId}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function deactivateUnit(unitId: string): Promise<void> {
  await apiRequest<void>(`/api/units/${unitId}`, {
    method: 'DELETE',
  })
}
