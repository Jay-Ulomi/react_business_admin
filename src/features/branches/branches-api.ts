import { apiRequest } from '../../lib/http'

export type Branch = {
  id: string
  businessId: string
  tenantId: string
  name: string
  code?: string
  address?: string
  city?: string
  phone?: string
  email?: string
  isActive: boolean
  active?: boolean
  isMainBranch: boolean
  isWarehouse?: boolean
}

export type CreateBranchRequest = {
  name: string
  code?: string
  address?: string
  city?: string
  phone?: string
  email?: string
  isMainBranch?: boolean
  isWarehouse?: boolean
}

export type UpdateBranchRequest = {
  name?: string
  code?: string
  address?: string
  city?: string
  phone?: string
  email?: string
  isActive?: boolean
  isMainBranch?: boolean
  isWarehouse?: boolean
}

export async function fetchBranches(businessId: string): Promise<Branch[]> {
  return apiRequest<Branch[]>(`/api/businesses/${businessId}/branches`)
}

export async function createBranch(businessId: string, payload: CreateBranchRequest): Promise<Branch> {
  return apiRequest<Branch>(`/api/businesses/${businessId}/branches`, {
    method: 'POST',
    body: payload,
  })
}

export async function updateBranch(
  businessId: string,
  branchId: string,
  payload: UpdateBranchRequest,
): Promise<Branch> {
  return apiRequest<Branch>(`/api/businesses/${businessId}/branches/${branchId}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function deactivateBranch(businessId: string, branchId: string): Promise<void> {
  await apiRequest<void>(`/api/businesses/${businessId}/branches/${branchId}`, {
    method: 'DELETE',
  })
}
