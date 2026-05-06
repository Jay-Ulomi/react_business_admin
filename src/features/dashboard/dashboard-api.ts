import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type DailySalesReport = {
  branchId: string
  date: string
  totalTransactions: number
  totalSales: number
  netSales: number
}

export type LowStockReport = {
  branchId: string
  totalLowStockItems: number
  items: Array<{
    productId: string
    productName: string
    currentStock: number
  }>
}

export type SaleStatus = 'COMPLETED' | 'VOIDED' | 'SUSPENDED' | string

export type SaleItemResponse = {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  costPrice: number
  discountAmount: number
  taxAmount: number
  lineTotal: number
}

export type SalePaymentResponse = {
  id: string
  paymentMethod: string
  amount: number
  reference?: string
  paidAt?: string
}

export type SaleResponse = {
  id: string
  saleNumber: string
  totalAmount: number
  status: SaleStatus
  saleDate: string
  customerId?: string
  sessionId?: string
  subtotal?: number
  discountAmount?: number
  taxAmount?: number
  changeAmount?: number
  notes?: string
  items?: SaleItemResponse[]
  payments?: SalePaymentResponse[]
}

export type ReceiptResponse = {
  businessName?: string
  branchName?: string
  saleNumber: string
  saleDate: string
  status: SaleStatus
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  totalPaid?: number
  changeAmount?: number
  currency?: string
  cashierName?: string
  items: Array<{
    productName: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }>
  payments?: SalePaymentResponse[]
}

export async function fetchDailySalesReport(branchId: string, date: string): Promise<DailySalesReport> {
  const query = new URLSearchParams({ branchId, date })
  return apiRequest<DailySalesReport>(`/api/reports/daily-sales?${query.toString()}`)
}

export async function fetchLowStockReport(branchId: string): Promise<LowStockReport> {
  return apiRequest<LowStockReport>(`/api/reports/low-stock/${branchId}`)
}

export async function fetchRecentSales(branchId: string): Promise<SpringPage<SaleResponse>> {
  const query = new URLSearchParams()
  query.set('branchId', branchId)
  query.set('sort', 'saleDate,desc')
  query.set('size', '5')
  return apiRequest<SpringPage<SaleResponse>>(`/api/pos/sales?${query.toString()}`)
}

export async function fetchSalesPage(params: {
  branchId: string
  status?: SaleStatus
  fromDate?: string
  toDate?: string
  page?: number
  size?: number
}): Promise<SpringPage<SaleResponse>> {
  const query = new URLSearchParams()
  query.set('branchId', params.branchId)
  if (params.status && params.status !== 'ALL') query.set('status', params.status)
  if (params.fromDate) query.set('fromDate', params.fromDate)
  if (params.toDate) query.set('toDate', params.toDate)
  query.set('sort', 'saleDate,desc')
  query.set('page', String(params.page ?? 0))
  query.set('size', String(params.size ?? 20))
  return apiRequest<SpringPage<SaleResponse>>(`/api/pos/sales?${query.toString()}`)
}

export async function fetchSale(saleId: string): Promise<SaleResponse> {
  return apiRequest<SaleResponse>(`/api/pos/sales/${saleId}`)
}

export async function voidSale(saleId: string): Promise<SaleResponse> {
  return apiRequest<SaleResponse>(`/api/pos/sales/${saleId}/void`, { method: 'POST' })
}

export async function fetchSaleReceipt(saleId: string): Promise<ReceiptResponse> {
  return apiRequest<ReceiptResponse>(`/api/pos/sales/${saleId}/receipt`)
}
