import { apiRequest } from '../../lib/http'

// ── Business types ─────────────────────────────────────────────────────────

export const BUSINESS_TYPES = [
  'GROCERY', 'SUPERMARKET', 'RESTAURANT', 'CAFE', 'BAKERY', 'BUTCHERY',
  'PHARMACY', 'CLINIC', 'SALON', 'ELECTRONICS', 'HARDWARE', 'CLOTHING',
  'AGRICULTURE', 'WHOLESALE', 'HOTEL', 'SCHOOL', 'RETAIL', 'LAUNDRY', 'GENERAL',
] as const
export type BusinessType = typeof BUSINESS_TYPES[number]

export type BusinessInfo = {
  id: string
  name: string
  type?: string
  address?: string
  city?: string
  phone?: string
  email?: string
  currency?: string
  timezone?: string
  isActive?: boolean
  active?: boolean
}

export type CreateBusinessRequest = {
  name: string
  type: string
  address?: string
  city?: string
  phone?: string
  email?: string
  currency?: string
  timezone?: string
}

export type BusinessTypeDef = {
  id: string
  code: string
  label: string
  description?: string
  isActive: boolean
  sortOrder: number
}

export async function fetchBusinessTypes(): Promise<BusinessTypeDef[]> {
  return apiRequest<BusinessTypeDef[]>('/api/business-types')
}

export async function createBusiness(payload: CreateBusinessRequest): Promise<BusinessInfo> {
  return apiRequest<BusinessInfo>('/api/businesses', { method: 'POST', body: payload })
}

export async function updateBusiness(businessId: string, payload: Partial<CreateBusinessRequest>): Promise<BusinessInfo> {
  return apiRequest<BusinessInfo>(`/api/businesses/${businessId}`, { method: 'PUT', body: payload })
}

export async function seedBusinessDefaults(businessId: string, type?: string): Promise<void> {
  const qs = type ? `?type=${encodeURIComponent(type)}` : ''
  await apiRequest<void>(`/api/businesses/${businessId}/seed-defaults${qs}`, { method: 'POST' })
}

// ── Business users ─────────────────────────────────────────────────────────

export type BusinessUser = {
  id: string
  userId: string
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  businessId?: string
  tenantId?: string
  roleId?: string
  roleName?: string
  isActive?: boolean
  active?: boolean
  branchAccesses?: Array<{
    id: string
    branchId: string
    branchName: string
    isActive: boolean
  }>
}

export type BusinessTaxProfile = {
  id: string
  businessId: string
  tin?: string
  vrn?: string
  receiptPrefix?: string
  serialNumber?: string
  taxOffice?: string
  fiscalMode?: string
  complianceStatus?: string
  traEnabled: boolean
  isActive?: boolean
  active?: boolean
  updatedAt?: string
}

export type FiscalMode = 'TEST' | 'LIVE'

export type Role = {
  id: string
  tenantId?: string
  businessId?: string
  name: string
  description?: string
  isSystemRole: boolean
  isActive: boolean
  active?: boolean
}

export type CreateBusinessUserRequest = {
  firstName: string
  lastName: string
  email: string
  password: string
  phone?: string
  businessId: string
  roleId: string
  branchIds?: string[]
}

export type UpdateBusinessUserRequest = {
  firstName?: string
  lastName?: string
  phone?: string
  roleId?: string
  isActive?: boolean
  branchIds?: string[]
}

export type CreateBusinessTaxProfileRequest = {
  businessId: string
  tin: string
  vrn?: string
  receiptPrefix?: string
  certPath?: string
  serialNumber?: string
  taxOffice?: string
  fiscalMode?: FiscalMode
  traEnabled?: boolean
}

export type UpdateBusinessTaxProfileRequest = {
  tin?: string
  vrn?: string
  receiptPrefix?: string
  certPath?: string
  serialNumber?: string
  taxOffice?: string
  fiscalMode?: FiscalMode
  traEnabled?: boolean
  isActive?: boolean
}

export async function fetchBusinessUsers(businessId: string): Promise<BusinessUser[]> {
  return apiRequest<BusinessUser[]>(`/api/users/business-users/business/${businessId}`)
}

export async function createBusinessUser(payload: CreateBusinessUserRequest): Promise<BusinessUser> {
  return apiRequest<BusinessUser>('/api/users/business-users', {
    method: 'POST',
    body: payload,
  })
}

export async function updateBusinessUser(userId: string, payload: UpdateBusinessUserRequest): Promise<BusinessUser> {
  return apiRequest<BusinessUser>(`/api/users/business-users/${userId}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function deactivateBusinessUser(userId: string): Promise<void> {
  await apiRequest<void>(`/api/users/business-users/${userId}`, {
    method: 'DELETE',
  })
}

export async function fetchRoles(businessId?: string): Promise<Role[]> {
  const query = new URLSearchParams()
  if (businessId) query.set('businessId', businessId)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return apiRequest<Role[]>(`/api/roles${suffix}`)
}

export async function fetchSystemRoles(): Promise<Role[]> {
  return apiRequest<Role[]>('/api/roles/system')
}

export async function fetchBusinessTaxProfile(businessId: string): Promise<BusinessTaxProfile> {
  return apiRequest<BusinessTaxProfile>(`/api/integrations/tra/profile/${businessId}`)
}

export async function createBusinessTaxProfile(
  payload: CreateBusinessTaxProfileRequest,
): Promise<BusinessTaxProfile> {
  return apiRequest<BusinessTaxProfile>('/api/integrations/tra/profile', {
    method: 'POST',
    body: payload,
  })
}

export async function updateBusinessTaxProfile(
  businessId: string,
  payload: UpdateBusinessTaxProfileRequest,
): Promise<BusinessTaxProfile> {
  return apiRequest<BusinessTaxProfile>(`/api/integrations/tra/profile/${businessId}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function enableTra(businessId: string): Promise<BusinessTaxProfile> {
  return apiRequest<BusinessTaxProfile>(`/api/integrations/tra/profile/${businessId}/enable`, {
    method: 'POST',
  })
}

export async function disableTra(businessId: string): Promise<BusinessTaxProfile> {
  return apiRequest<BusinessTaxProfile>(`/api/integrations/tra/profile/${businessId}/disable`, {
    method: 'POST',
  })
}
