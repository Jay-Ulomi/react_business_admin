import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type ProductVariantResponse = {
  id: string
  productId: string
  name: string
  sku?: string
  barcode?: string
  costPrice?: number
  sellingPrice?: number
  attributes?: Record<string, string>
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export type ProductResponse = {
  id: string
  businessId: string
  name: string
  sku?: string
  barcode?: string
  description?: string
  categoryId?: string
  categoryName?: string
  unitId?: string
  unitName?: string
  unitAbbreviation?: string
  costPrice?: number
  sellingPrice: number
  taxRate?: number
  active: boolean
  taxable: boolean
  minStockLevel?: number
  imageUrl?: string
  allowDecimalQuantity: boolean
  trackingType?: 'NONE' | 'SERIAL' | 'LOT'
  createdAt?: string
  updatedAt?: string
  isActive?: boolean
  isTaxable?: boolean
  variants?: ProductVariantResponse[]
}

export type CreateProductRequest = {
  name: string
  categoryId?: string
  unitId?: string
  sku?: string
  barcode?: string
  description?: string
  costPrice?: number
  sellingPrice: number
  taxRate?: number
  isTaxable?: boolean
  minStockLevel?: number
  imageUrl?: string
  allowDecimalQuantity?: boolean
}

export type UpdateProductRequest = {
  name?: string
  categoryId?: string
  clearCategoryId?: boolean
  unitId?: string
  clearUnitId?: boolean
  sku?: string
  clearSku?: boolean
  barcode?: string
  clearBarcode?: boolean
  description?: string
  costPrice?: number
  sellingPrice?: number
  taxRate?: number
  isActive?: boolean
  isTaxable?: boolean
  minStockLevel?: number
  imageUrl?: string
  allowDecimalQuantity?: boolean
}

export async function fetchProducts(params: {
  search?: string
  categoryId?: string
  isActive?: boolean
  page?: number
  size?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}): Promise<SpringPage<ProductResponse>> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.categoryId) query.set('categoryId', params.categoryId)
  if (params.isActive !== undefined) query.set('isActive', String(params.isActive))
  query.set('page', String(params.page ?? 0))
  query.set('size', String(params.size ?? 20))
  query.set('sort', `${params.sortBy ?? 'updatedAt'},${params.sortDir ?? 'desc'}`)

  return apiRequest<SpringPage<ProductResponse>>(`/api/products?${query.toString()}`)
}

export async function createProduct(payload: CreateProductRequest): Promise<ProductResponse> {
  return apiRequest<ProductResponse>('/api/products', {
    method: 'POST',
    body: payload,
  })
}

export async function updateProduct(productId: string, payload: UpdateProductRequest): Promise<ProductResponse> {
  return apiRequest<ProductResponse>(`/api/products/${productId}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function deactivateProduct(productId: string): Promise<void> {
  await apiRequest<void>(`/api/products/${productId}`, {
    method: 'DELETE',
  })
}

// ─── Product Variants ──────────────────────────────────────────────────────

export type CreateVariantRequest = {
  name: string
  sku?: string
  barcode?: string
  costPrice?: number
  sellingPrice?: number
  attributes?: Record<string, string>
}

export type UpdateVariantRequest = {
  name?: string
  sku?: string
  barcode?: string
  costPrice?: number
  sellingPrice?: number
  attributes?: Record<string, string>
  isActive?: boolean
}

export async function fetchVariants(productId: string): Promise<ProductVariantResponse[]> {
  return apiRequest<ProductVariantResponse[]>(`/api/products/${productId}/variants`)
}

export async function createVariant(productId: string, payload: CreateVariantRequest): Promise<ProductVariantResponse> {
  return apiRequest<ProductVariantResponse>(`/api/products/${productId}/variants`, {
    method: 'POST',
    body: payload,
  })
}

export async function updateVariant(
  productId: string,
  variantId: string,
  payload: UpdateVariantRequest,
): Promise<ProductVariantResponse> {
  return apiRequest<ProductVariantResponse>(`/api/products/${productId}/variants/${variantId}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function deactivateVariant(productId: string, variantId: string): Promise<void> {
  await apiRequest<void>(`/api/products/${productId}/variants/${variantId}`, {
    method: 'DELETE',
  })
}
