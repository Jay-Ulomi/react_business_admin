import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT'
export type PromotionScope = 'CART' | 'PRODUCT' | 'CATEGORY'

export type PromotionResponse = {
  id: string
  name: string
  description?: string
  discountType: DiscountType
  discountValue: number
  scope: PromotionScope
  minimumOrderAmount?: number
  productIds?: string[]
  categoryIds?: string[]
  startDate?: string
  endDate?: string
  isActive: boolean
  usageLimit?: number
  usageCount: number
  couponCode?: string
  createdAt?: string
  updatedAt?: string
}

export type PromotionRequest = {
  name: string
  description?: string
  discountType: DiscountType
  discountValue: number
  scope: PromotionScope
  minimumOrderAmount?: number
  productIds?: string[]
  categoryIds?: string[]
  startDate?: string
  endDate?: string
  usageLimit?: number
  couponCode?: string
}

export async function fetchPromotions(page = 0, size = 20): Promise<SpringPage<PromotionResponse>> {
  const query = new URLSearchParams({ page: String(page), size: String(size) })
  return apiRequest<SpringPage<PromotionResponse>>(`/api/promotions?${query.toString()}`)
}

export async function createPromotion(payload: PromotionRequest): Promise<PromotionResponse> {
  return apiRequest<PromotionResponse>('/api/promotions', { method: 'POST', body: payload })
}

export async function updatePromotion(promotionId: string, payload: PromotionRequest): Promise<PromotionResponse> {
  return apiRequest<PromotionResponse>(`/api/promotions/${promotionId}`, { method: 'PUT', body: payload })
}

export async function deactivatePromotion(promotionId: string): Promise<void> {
  await apiRequest<void>(`/api/promotions/${promotionId}`, { method: 'DELETE' })
}

export async function validateCoupon(couponCode: string): Promise<PromotionResponse> {
  return apiRequest<PromotionResponse>('/api/promotions/validate-coupon', {
    method: 'POST',
    body: { couponCode },
  })
}
