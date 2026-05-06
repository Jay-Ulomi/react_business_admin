import { apiRequest } from '../../lib/http'

export type ProductCategory = {
  id: string
  businessId: string
  name: string
  description?: string
  parentCategoryId?: string
  parentCategoryName?: string
  isActive: boolean
  active?: boolean
  sortOrder: number
  createdAt?: string
  updatedAt?: string
}

export type CreateProductCategoryRequest = {
  name: string
  description?: string
  parentCategoryId?: string
  sortOrder?: number
}

export type UpdateProductCategoryRequest = {
  name?: string
  description?: string
  parentCategoryId?: string
  clearParentCategory?: boolean
  sortOrder?: number
  isActive?: boolean
}

export async function fetchCategories(): Promise<ProductCategory[]> {
  return apiRequest<ProductCategory[]>('/api/categories')
}

export async function createCategory(payload: CreateProductCategoryRequest): Promise<ProductCategory> {
  return apiRequest<ProductCategory>('/api/categories', {
    method: 'POST',
    body: payload,
  })
}

export async function updateCategory(
  categoryId: string,
  payload: UpdateProductCategoryRequest,
): Promise<ProductCategory> {
  return apiRequest<ProductCategory>(`/api/categories/${categoryId}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function deactivateCategory(categoryId: string): Promise<void> {
  await apiRequest<void>(`/api/categories/${categoryId}`, {
    method: 'DELETE',
  })
}
