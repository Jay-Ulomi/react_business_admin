import { apiRequest } from '../../lib/http'

export type StockCountStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'

export type StockCountItemResponse = {
  id: string
  productId: string
  productName?: string
  systemQuantity: number
  countedQuantity: number
  discrepancy: number
  notes?: string
}

export type StockCountResponse = {
  id: string
  branchId: string
  countDate: string
  status: StockCountStatus
  notes?: string
  completedBy?: string
  completedAt?: string
  items: StockCountItemResponse[]
  createdAt?: string
  updatedAt?: string
}

export type CreateStockCountRequest = {
  branchId: string
  countDate?: string
  notes?: string
}

export type StockCountItemRequest = {
  productId: string
  countedQuantity: number
  notes?: string
}

export async function fetchStockCountsByBranch(branchId: string): Promise<StockCountResponse[]> {
  return apiRequest<StockCountResponse[]>(`/api/stock-counts/branches/${branchId}`)
}

export async function fetchStockCount(stockCountId: string): Promise<StockCountResponse> {
  return apiRequest<StockCountResponse>(`/api/stock-counts/${stockCountId}`)
}

export async function createStockCount(payload: CreateStockCountRequest): Promise<StockCountResponse> {
  return apiRequest<StockCountResponse>('/api/stock-counts', {
    method: 'POST',
    body: payload,
  })
}

export async function addStockCountItem(
  stockCountId: string,
  payload: StockCountItemRequest,
): Promise<StockCountResponse> {
  return apiRequest<StockCountResponse>(`/api/stock-counts/${stockCountId}/items`, {
    method: 'POST',
    body: payload,
  })
}

export async function finalizeStockCount(stockCountId: string): Promise<StockCountResponse> {
  return apiRequest<StockCountResponse>(`/api/stock-counts/${stockCountId}/finalize`, {
    method: 'POST',
  })
}

export async function cancelStockCount(stockCountId: string): Promise<StockCountResponse> {
  return apiRequest<StockCountResponse>(`/api/stock-counts/${stockCountId}/cancel`, {
    method: 'POST',
  })
}
