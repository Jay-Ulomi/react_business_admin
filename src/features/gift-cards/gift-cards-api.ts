import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type GiftCardResponse = {
  id: string
  code: string
  initialBalance: number
  currentBalance: number
  isActive: boolean
  expiryDate?: string
  issuedToCustomerId?: string
  note?: string
  createdAt?: string
  updatedAt?: string
}

export type IssueGiftCardRequest = {
  code?: string
  initialBalance: number
  expiryDate?: string
  issuedToCustomerId?: string
  note?: string
}

export type GiftCardBalanceResponse = {
  code: string
  currentBalance: number
  isActive: boolean
  expiryDate?: string
}

export async function fetchGiftCards(page = 0, size = 20): Promise<SpringPage<GiftCardResponse>> {
  const query = new URLSearchParams({ page: String(page), size: String(size) })
  return apiRequest<SpringPage<GiftCardResponse>>(`/api/gift-cards?${query.toString()}`)
}

export async function issueGiftCard(payload: IssueGiftCardRequest): Promise<GiftCardResponse> {
  return apiRequest<GiftCardResponse>('/api/gift-cards', { method: 'POST', body: payload })
}

export async function checkGiftCardBalance(code: string): Promise<GiftCardBalanceResponse> {
  return apiRequest<GiftCardBalanceResponse>(`/api/gift-cards/balance/${encodeURIComponent(code)}`)
}

export async function deactivateGiftCard(id: string): Promise<void> {
  await apiRequest<void>(`/api/gift-cards/${id}`, { method: 'DELETE' })
}
