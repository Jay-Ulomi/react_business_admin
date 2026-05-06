import { apiRequest } from '../../lib/http'

export type CustomerGroupResponse = {
  id: string
  businessId: string
  name: string
  description?: string
  discountPercentage?: number
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export type CreateCustomerGroupRequest = {
  name: string
  description?: string
  discountPercentage?: number
}

export type UpdateCustomerGroupRequest = {
  name?: string
  description?: string
  discountPercentage?: number
  isActive?: boolean
}

export async function fetchCustomerGroups(): Promise<CustomerGroupResponse[]> {
  return apiRequest<CustomerGroupResponse[]>('/api/customer-groups')
}

export async function fetchCustomerGroup(groupId: string): Promise<CustomerGroupResponse> {
  return apiRequest<CustomerGroupResponse>(`/api/customer-groups/${groupId}`)
}

export async function createCustomerGroup(
  payload: CreateCustomerGroupRequest,
): Promise<CustomerGroupResponse> {
  return apiRequest<CustomerGroupResponse>('/api/customer-groups', {
    method: 'POST',
    body: payload,
  })
}

export async function updateCustomerGroup(
  groupId: string,
  payload: UpdateCustomerGroupRequest,
): Promise<CustomerGroupResponse> {
  return apiRequest<CustomerGroupResponse>(`/api/customer-groups/${groupId}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function deactivateCustomerGroup(groupId: string): Promise<void> {
  await apiRequest<void>(`/api/customer-groups/${groupId}`, {
    method: 'DELETE',
  })
}
