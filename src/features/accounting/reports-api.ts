import { apiRequest } from '../../lib/http'

export type TrialBalanceEntry = {
  accountName: string
  accountType: string
  debitBalance: number
  creditBalance: number
}

export type TrialBalanceReport = {
  asOfDate: string
  entries: TrialBalanceEntry[]
  totalDebits: number
  totalCredits: number
}

export type ReportLineItem = {
  name: string
  amount: number
}

export type ProfitAndLossReport = {
  startDate: string
  endDate: string
  totalRevenue: number
  costOfGoodsSold: number
  grossProfit: number
  totalExpenses: number
  netProfit: number
  revenueItems: ReportLineItem[]
  expenseItems: ReportLineItem[]
}

export type BalanceSheetEntry = {
  name: string
  amount: number
}

export type BalanceSheetReport = {
  asOfDate: string
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  assets: BalanceSheetEntry[]
  liabilities: BalanceSheetEntry[]
  equity: BalanceSheetEntry[]
}

export async function fetchTrialBalance(asOfDate: string): Promise<TrialBalanceReport> {
  const query = new URLSearchParams({ asOfDate })
  return apiRequest<TrialBalanceReport>(
    `/api/accounting/reports/trial-balance?${query.toString()}`,
  )
}

export async function fetchProfitAndLoss(
  startDate: string,
  endDate: string,
): Promise<ProfitAndLossReport> {
  const query = new URLSearchParams({ startDate, endDate })
  return apiRequest<ProfitAndLossReport>(
    `/api/accounting/reports/profit-loss?${query.toString()}`,
  )
}

export async function fetchBalanceSheet(asOfDate: string): Promise<BalanceSheetReport> {
  const query = new URLSearchParams({ asOfDate })
  return apiRequest<BalanceSheetReport>(
    `/api/accounting/reports/balance-sheet?${query.toString()}`,
  )
}
