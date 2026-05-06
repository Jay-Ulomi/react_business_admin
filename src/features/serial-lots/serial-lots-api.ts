import { apiRequest } from '../../lib/http'
import type { SpringPage } from '../../types/pagination'

export type TrackingType = 'NONE' | 'SERIAL' | 'LOT'
export type SerialLotStatus = 'AVAILABLE' | 'SOLD' | 'EXPIRED' | 'RESERVED'

export type SerialLotResponse = {
  id: string
  productId: string
  trackingType: TrackingType
  serialNumber?: string
  lotNumber?: string
  expiryDate?: string
  quantity: number
  availableQty: number
  status: SerialLotStatus
  saleId?: string
  notes?: string
  createdAt?: string
}

export type ReceiveSerialLotRequest = {
  productId: string
  trackingType: TrackingType
  codes: string[]
  lotQuantity?: number
  expiryDate?: string
  notes?: string
}

export async function fetchSerialLots(
  productId: string,
  status?: SerialLotStatus,
  page = 0,
  size = 50,
): Promise<SpringPage<SerialLotResponse>> {
  const query = new URLSearchParams({ productId, page: String(page), size: String(size) })
  if (status) query.set('status', status)
  return apiRequest<SpringPage<SerialLotResponse>>(`/api/serial-lots?${query.toString()}`)
}

export async function receiveSerialLots(payload: ReceiveSerialLotRequest): Promise<SerialLotResponse[]> {
  return apiRequest<SerialLotResponse[]>('/api/serial-lots/receive', { method: 'POST', body: payload })
}
