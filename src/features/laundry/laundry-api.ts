import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type LaundryOrderStatus = 'RECEIVED' | 'WASHING' | 'IRONING' | 'READY' | 'COLLECTED' | 'CANCELED'
export type LaundryPaymentMethod = 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER'

export type LaundryOrderItem = {
  id: string
  productId?: string
  itemName: string
  quantity: number
  unitPrice: number
  lineTotal: number
  notes?: string
}

export type LaundryOrderPayment = {
  id: string
  amount: number
  paymentMethod: LaundryPaymentMethod
  reference?: string
  notes?: string
  paymentDate?: string
  createdAt?: string
}

export type LaundryOrder = {
  id: string
  branchId: string
  customerId?: string
  customerName?: string
  customerPhone?: string
  ticketNumber: string
  dueDate?: string
  status: LaundryOrderStatus
  totalAmount: number
  paidAmount: number
  balanceAmount: number
  notes?: string
  items: LaundryOrderItem[]
  payments?: LaundryOrderPayment[]
  createdAt: string
  updatedAt?: string
}

export type CreateLaundryOrderPayload = {
  customerId?: string
  customerName?: string
  customerPhone?: string
  dueDate?: string
  notes?: string
  paidAmount?: number
  paymentMethod?: LaundryPaymentMethod
  paymentReference?: string
  items: Array<{
    productId: string
    quantity: number
    unitPrice: number
    notes?: string
  }>
}

export async function fetchLaundryOrders(params: {
  branchId?: string
  status?: LaundryOrderStatus
  search?: string
  fromDueDate?: string
  toDueDate?: string
  page?: number
  size?: number
}): Promise<SpringPage<LaundryOrder>> {
  const query = new URLSearchParams()
  if (params.branchId) query.set('branchId', params.branchId)
  if (params.status) query.set('status', params.status)
  if (params.search) query.set('search', params.search)
  if (params.fromDueDate) query.set('fromDueDate', params.fromDueDate)
  if (params.toDueDate) query.set('toDueDate', params.toDueDate)
  query.set('page', String(params.page ?? 0))
  query.set('size', String(params.size ?? 15))
  query.set('sort', 'createdAt,desc')
  return apiRequest<SpringPage<LaundryOrder>>(`/api/laundry/orders?${query.toString()}`)
}

export async function createLaundryOrder(payload: CreateLaundryOrderPayload): Promise<LaundryOrder> {
  return apiRequest<LaundryOrder>('/api/laundry/orders', { method: 'POST', body: payload })
}

export async function updateLaundryStatus(orderId: string, status: LaundryOrderStatus, notes?: string): Promise<LaundryOrder> {
  return apiRequest<LaundryOrder>(`/api/laundry/orders/${orderId}/status`, {
    method: 'POST',
    body: { status, notes },
  })
}

export async function recordLaundryPayment(
  orderId: string,
  amount: number,
  paymentMethod?: LaundryPaymentMethod,
  notes?: string,
  reference?: string,
): Promise<LaundryOrder> {
  return apiRequest<LaundryOrder>(`/api/laundry/orders/${orderId}/payments`, {
    method: 'POST',
    body: { amount, paymentMethod, notes, reference },
  })
}
