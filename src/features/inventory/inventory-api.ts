import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type StockBalanceResponse = {
  id: string
  branchId: string
  productId: string
  productName: string
  productSku?: string
  quantity: number
  reservedQuantity: number
  availableQuantity: number
  minStockLevel: number
  lowStock: boolean
  isLowStock?: boolean
  updatedAt?: string
}

export type InventoryMovementResponse = {
  id: string
  branchId: string
  productId: string
  productName: string
  movementType: string
  quantityBefore: number
  quantityChanged: number
  quantityAfter: number
  notes?: string
  createdAt: string
}

export type InventoryMovementSummaryResponse = {
  totalRows: number
  createdQuantity: number
  returnedQuantity: number
}

export type InventoryOverviewResponse = {
  businessId: string
  warehouseBranchCount: number
  storeBranchCount: number
  warehouseStockQuantity: number
  storeStockQuantity: number
  warehouseAvailableQuantity: number
  storeAvailableQuantity: number
  warehouseSkuCount: number
  storeSkuCount: number
  branches: Array<{
    branchId: string
    branchName: string
    isWarehouse: boolean
    totalQuantity: number
    totalReservedQuantity: number
    totalAvailableQuantity: number
    skuCount: number
  }>
  transferMovement: {
    totalTransfers: number
    completedTransfers: number
    totalTransferredOut: number
    totalTransferredIn: number
    warehouseInboundQuantity: number
    warehouseOutboundQuantity: number
  }
}

export async function fetchStockByBranch(branchId: string): Promise<StockBalanceResponse[]> {
  return apiRequest<StockBalanceResponse[]>(`/api/inventory/branches/${branchId}/stock`)
}

export async function fetchLowStockByBranch(branchId: string): Promise<StockBalanceResponse[]> {
  return apiRequest<StockBalanceResponse[]>(`/api/inventory/branches/${branchId}/low-stock`)
}

export async function fetchMovements(params: {
  branchId: string
  movementType?: string
  notesPrefix?: string
  search?: string
  fromDate?: string
  toDate?: string
  page?: number
  size?: number
}): Promise<SpringPage<InventoryMovementResponse>> {
  const query = new URLSearchParams()
  if (params.movementType) query.set('movementType', params.movementType)
  if (params.notesPrefix) query.set('notesPrefix', params.notesPrefix)
  if (params.search) query.set('search', params.search)
  if (params.fromDate) query.set('fromDate', params.fromDate)
  if (params.toDate) query.set('toDate', params.toDate)
  query.set('page', String(params.page ?? 0))
  query.set('size', String(params.size ?? 10))
  return apiRequest<SpringPage<InventoryMovementResponse>>(
    `/api/inventory/branches/${params.branchId}/movements?${query.toString()}`,
  )
}

export async function fetchMovementSummary(params: {
  branchId: string
  movementType?: string
  notesPrefix?: string
  search?: string
  fromDate?: string
  toDate?: string
}): Promise<InventoryMovementSummaryResponse> {
  const query = new URLSearchParams()
  if (params.movementType) query.set('movementType', params.movementType)
  if (params.notesPrefix) query.set('notesPrefix', params.notesPrefix)
  if (params.search) query.set('search', params.search)
  if (params.fromDate) query.set('fromDate', params.fromDate)
  if (params.toDate) query.set('toDate', params.toDate)
  return apiRequest<InventoryMovementSummaryResponse>(
    `/api/inventory/branches/${params.branchId}/movements/summary?${query.toString()}`,
  )
}

export async function fetchInventoryOverview(): Promise<InventoryOverviewResponse> {
  return apiRequest<InventoryOverviewResponse>('/api/inventory/overview')
}
