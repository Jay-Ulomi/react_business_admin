import { apiRequest } from '../../lib/http'

export type DailySalesTopProduct = {
  productId: string
  productName: string
  quantitySold: number
  totalRevenue: number
}

export type DailySalesReport = {
  branchId: string
  date: string
  totalTransactions: number
  completedTransactions: number
  voidedTransactions: number
  totalSales: number
  totalReturns: number
  netSales: number
  totalTax: number
  totalDiscount: number
  paymentMethodTotals: Record<string, number>
  topProducts: DailySalesTopProduct[]
}

export type LowStockReport = {
  branchId: string
  totalLowStockItems: number
  items: Array<{
    productId: string
    productName: string
    sku?: string
    currentStock: number
    minStockLevel: number
    deficit: number
  }>
}

export type SalesSummaryReport = {
  businessId: string
  startDate: string
  endDate: string
  totalRevenue: number
  totalExpenses: number
  profitEstimate: number
  totalTransactions: number
  totalTax: number
  totalDiscount: number
}

export type BranchPerformanceReport = {
  businessId: string
  startDate: string
  endDate: string
  branches: Array<{
    branchId: string
    branchName: string
    transactionCount: number
    totalSales: number
    totalExpenses: number
    netRevenue: number
  }>
}

export async function fetchDailySalesReport(branchId: string, date: string): Promise<DailySalesReport> {
  const query = new URLSearchParams({ branchId, date })
  return apiRequest<DailySalesReport>(`/api/reports/daily-sales?${query.toString()}`)
}

export async function fetchLowStockReport(branchId: string): Promise<LowStockReport> {
  return apiRequest<LowStockReport>(`/api/reports/low-stock/${branchId}`)
}

export async function fetchSalesSummaryReport(
  startDate: string,
  endDate: string,
): Promise<SalesSummaryReport> {
  const query = new URLSearchParams({ startDate, endDate })
  return apiRequest<SalesSummaryReport>(`/api/reports/sales-summary?${query.toString()}`)
}

export async function fetchBranchPerformanceReport(
  startDate: string,
  endDate: string,
): Promise<BranchPerformanceReport> {
  const query = new URLSearchParams({ startDate, endDate })
  return apiRequest<BranchPerformanceReport>(`/api/reports/branch-performance?${query.toString()}`)
}

export type CashierSessionReport = {
  sessionId: string
  userId: string
  cashierName?: string
  branchId: string
  openedAt: string
  closedAt?: string
  status: string
  completedSalesCount: number
  voidedSalesCount: number
  totalSalesAmount: number
  openingCash: number
  closingCash: number
  expectedCash: number
  cashDifference: number
  paymentBreakdown: Record<string, number>
}

export async function fetchCashierSessionReport(sessionId: string): Promise<CashierSessionReport> {
  return apiRequest<CashierSessionReport>(`/api/reports/cashier-shift/${sessionId}`)
}

export async function fetchCashierSessions(
  branchId: string,
  startDate: string,
  endDate: string,
): Promise<CashierSessionReport[]> {
  const query = new URLSearchParams({ branchId, startDate, endDate })
  return apiRequest<CashierSessionReport[]>(`/api/reports/cashier-sessions?${query.toString()}`)
}
