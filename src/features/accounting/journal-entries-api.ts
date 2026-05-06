import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type JournalEntryStatus = 'DRAFT' | 'POSTED' | 'REVERSED'

export type JournalEntryReferenceType =
  | 'SALE'
  | 'EXPENSE'
  | 'PURCHASE'
  | 'REFUND'
  | 'MANUAL'
  | 'ADJUSTMENT'

export type JournalEntryLineResponse = {
  id?: string
  accountId: string
  accountCode?: string
  accountName?: string
  description?: string
  debitAmount: number
  creditAmount: number
}

export type JournalEntryLineRequest = {
  accountId: string
  description?: string
  debitAmount: number
  creditAmount: number
}

export type JournalEntryResponse = {
  id: string
  businessId: string
  branchId?: string
  journalId: string
  journalName?: string
  entryNumber: string
  entryDate: string
  description?: string
  referenceType: JournalEntryReferenceType
  referenceId?: string
  status: JournalEntryStatus
  totalDebit: number
  totalCredit: number
  postedBy?: string
  postedAt?: string
  reversedBy?: string
  reversedAt?: string
  lines: JournalEntryLineResponse[]
  createdAt?: string
  updatedAt?: string
}

export type CreateJournalEntryRequest = {
  journalId: string
  branchId?: string
  entryDate?: string
  description?: string
  referenceType: JournalEntryReferenceType
  referenceId?: string
  lines: JournalEntryLineRequest[]
}

export type JournalResponse = {
  id: string
  businessId: string
  name: string
  description?: string
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export type CreateJournalRequest = {
  name: string
  description?: string
}

export async function fetchJournalEntries(params: {
  journalId?: string
  status?: JournalEntryStatus
  referenceType?: JournalEntryReferenceType
  startDate?: string
  endDate?: string
  page?: number
  size?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}): Promise<SpringPage<JournalEntryResponse>> {
  const query = new URLSearchParams()
  if (params.journalId) query.set('journalId', params.journalId)
  if (params.status) query.set('status', params.status)
  if (params.referenceType) query.set('referenceType', params.referenceType)
  if (params.startDate) query.set('startDate', params.startDate)
  if (params.endDate) query.set('endDate', params.endDate)
  query.set('page', String(params.page ?? 0))
  query.set('size', String(params.size ?? 20))
  query.set('sort', `${params.sortBy ?? 'entryDate'},${params.sortDir ?? 'desc'}`)
  return apiRequest<SpringPage<JournalEntryResponse>>(
    `/api/accounting/entries?${query.toString()}`,
  )
}

export async function fetchJournalEntry(entryId: string): Promise<JournalEntryResponse> {
  return apiRequest<JournalEntryResponse>(`/api/accounting/entries/${entryId}`)
}

export async function createJournalEntry(
  payload: CreateJournalEntryRequest,
): Promise<JournalEntryResponse> {
  return apiRequest<JournalEntryResponse>('/api/accounting/entries', {
    method: 'POST',
    body: payload,
  })
}

export async function postJournalEntry(entryId: string): Promise<JournalEntryResponse> {
  return apiRequest<JournalEntryResponse>(`/api/accounting/entries/${entryId}/post`, {
    method: 'POST',
  })
}

export async function reverseJournalEntry(entryId: string): Promise<JournalEntryResponse> {
  return apiRequest<JournalEntryResponse>(`/api/accounting/entries/${entryId}/reverse`, {
    method: 'POST',
  })
}

export async function fetchJournals(): Promise<JournalResponse[]> {
  return apiRequest<JournalResponse[]>('/api/accounting/journals')
}

export async function createJournal(payload: CreateJournalRequest): Promise<JournalResponse> {
  return apiRequest<JournalResponse>('/api/accounting/journals', {
    method: 'POST',
    body: payload,
  })
}
