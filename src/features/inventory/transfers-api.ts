import { apiRequest } from '../../lib/http'

export type TransferStatus = 'DRAFT' | 'PENDING' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELED'

export type TransferItemResponse = {
  id: string
  productId: string
  productName?: string
  requestedQuantity: number
  sentQuantity?: number
  receivedQuantity?: number
  notes?: string
}

export type TransferResponse = {
  id: string
  fromBranchId: string
  toBranchId: string
  status: TransferStatus
  transferDate: string
  notes?: string
  createdBy?: string
  approvedBy?: string
  receivedBy?: string
  items: TransferItemResponse[]
  createdAt?: string
  updatedAt?: string
}

export type TransferItemRequest = {
  productId: string
  requestedQuantity: number
  notes?: string
}

export type CreateTransferRequest = {
  fromBranchId: string
  toBranchId: string
  transferDate?: string
  notes?: string
  items: TransferItemRequest[]
}

export type ReceiveTransferItemRequest = {
  productId: string
  receivedQuantity: number
}

export type ReceiveTransferRequest = {
  items: ReceiveTransferItemRequest[]
  notes?: string
}

export async function fetchTransfers(): Promise<TransferResponse[]> {
  return apiRequest<TransferResponse[]>('/api/transfers')
}

export async function fetchTransfersByBranch(branchId: string): Promise<TransferResponse[]> {
  return apiRequest<TransferResponse[]>(`/api/transfers/branches/${branchId}`)
}

export async function fetchTransfer(transferId: string): Promise<TransferResponse> {
  return apiRequest<TransferResponse>(`/api/transfers/${transferId}`)
}

export async function createTransfer(payload: CreateTransferRequest): Promise<TransferResponse> {
  return apiRequest<TransferResponse>('/api/transfers', {
    method: 'POST',
    body: payload,
  })
}

export async function approveTransfer(transferId: string): Promise<TransferResponse> {
  return apiRequest<TransferResponse>(`/api/transfers/${transferId}/approve`, {
    method: 'POST',
  })
}

export async function shipTransfer(transferId: string): Promise<TransferResponse> {
  return apiRequest<TransferResponse>(`/api/transfers/${transferId}/ship`, {
    method: 'POST',
  })
}

export async function receiveTransfer(
  transferId: string,
  payload: ReceiveTransferRequest,
): Promise<TransferResponse> {
  return apiRequest<TransferResponse>(`/api/transfers/${transferId}/receive`, {
    method: 'POST',
    body: payload,
  })
}

export async function cancelTransfer(transferId: string): Promise<TransferResponse> {
  return apiRequest<TransferResponse>(`/api/transfers/${transferId}/cancel`, {
    method: 'POST',
  })
}
