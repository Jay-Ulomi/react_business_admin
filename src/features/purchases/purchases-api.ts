import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type PurchaseResponse = {
  id: string
  businessId: string
  branchId: string
  supplierId: string
  supplierName: string
  purchaseNumber: string
  purchaseDate: string
  expectedDeliveryDate?: string
  subtotal: number
  taxAmount: number
  totalAmount: number
  paidAmount: number
  balanceDue: number
  status: string
  notes?: string
  items?: PurchaseItemResponse[]
}

export type PurchaseItemResponse = {
  id: string
  productId: string
  productName: string
  quantity: number
  receivedQuantity: number
  unitCost: number
  taxAmount: number
  lineTotal: number
}

export type SupplierResponse = {
  id: string
  businessId: string
  name: string
  contactPerson?: string
  phone?: string
  email?: string
  city?: string
  active: boolean
  isActive?: boolean
}

export type CreatePurchaseItemRequest = {
  productId: string
  quantity: number
  unitCost: number
  taxAmount?: number
}

export type CreatePurchaseRequest = {
  branchId: string
  supplierId: string
  purchaseDate?: string
  expectedDeliveryDate?: string
  notes?: string
  items: CreatePurchaseItemRequest[]
}

export type UpdatePurchaseRequest = {
  supplierId?: string
  expectedDeliveryDate?: string
  notes?: string
}

export type ReceiveGoodsItemRequest = {
  purchaseItemId: string
  quantityReceived: number
}

export type ReceiveGoodsRequest = {
  receiptDate?: string
  notes?: string
  items: ReceiveGoodsItemRequest[]
}

export type CreateSupplierRequest = {
  name: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  country?: string
  taxId?: string
  notes?: string
}

export type UpdateSupplierRequest = {
  name?: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  country?: string
  taxId?: string
  isActive?: boolean
  notes?: string
}

export async function fetchPurchases(params: {
  branchId?: string
  status?: string
  fromDate?: string
  toDate?: string
  page?: number
  size?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}): Promise<SpringPage<PurchaseResponse>> {
  const query = new URLSearchParams()
  if (params.branchId) query.set('branchId', params.branchId)
  if (params.status) query.set('status', params.status)
  if (params.fromDate) query.set('fromDate', params.fromDate)
  if (params.toDate) query.set('toDate', params.toDate)
  query.set('page', String(params.page ?? 0))
  query.set('size', String(params.size ?? 15))
  query.set('sort', `${params.sortBy ?? 'purchaseDate'},${params.sortDir ?? 'desc'}`)
  return apiRequest<SpringPage<PurchaseResponse>>(`/api/purchases?${query.toString()}`)
}

export async function fetchSuppliers(params?: {
  search?: string
  isActive?: boolean
  page?: number
  size?: number
}): Promise<SpringPage<SupplierResponse>> {
  const query = new URLSearchParams()
  if (params?.search) query.set('search', params.search)
  if (params?.isActive !== undefined) query.set('isActive', String(params.isActive))
  query.set('page', String(params?.page ?? 0))
  query.set('size', String(params?.size ?? 10))
  return apiRequest<SpringPage<SupplierResponse>>(`/api/suppliers?${query.toString()}`)
}

export async function createPurchase(payload: CreatePurchaseRequest): Promise<PurchaseResponse> {
  return apiRequest<PurchaseResponse>('/api/purchases', {
    method: 'POST',
    body: payload,
  })
}

export async function updatePurchase(purchaseId: string, payload: UpdatePurchaseRequest): Promise<PurchaseResponse> {
  return apiRequest<PurchaseResponse>(`/api/purchases/${purchaseId}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function fetchPurchase(purchaseId: string): Promise<PurchaseResponse> {
  return apiRequest<PurchaseResponse>(`/api/purchases/${purchaseId}`)
}

export async function receiveGoods(
  purchaseId: string,
  payload: ReceiveGoodsRequest,
): Promise<{ id: string; receiptNumber: string }> {
  return apiRequest<{ id: string; receiptNumber: string }>(`/api/purchases/${purchaseId}/receipts`, {
    method: 'POST',
    body: payload,
  })
}

export async function createSupplier(payload: CreateSupplierRequest): Promise<SupplierResponse> {
  return apiRequest<SupplierResponse>('/api/suppliers', {
    method: 'POST',
    body: payload,
  })
}

export async function updateSupplier(supplierId: string, payload: UpdateSupplierRequest): Promise<SupplierResponse> {
  return apiRequest<SupplierResponse>(`/api/suppliers/${supplierId}`, {
    method: 'PUT',
    body: payload,
  })
}
