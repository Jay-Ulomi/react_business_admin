import { apiRequest } from '../../lib/http'

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED' | 'EXPIRED'
export type BillingCycle = 'MONTHLY' | 'ANNUAL'

export type PlanFeature = {
  id: string
  featureName: string
  featureValue: string
  isEnabled: boolean
}

export type Plan = {
  id: string
  name: string
  description: string | null
  monthlyPrice: number
  annualPrice: number
  trialDays: number
  isActive: boolean
  isDefault: boolean
  maxBusinesses: number
  maxBranches: number
  maxUsers: number
  sortOrder: number
  features: PlanFeature[]
}

export type Subscription = {
  id: string
  tenantId: string
  tenantName: string
  planId: string
  planName: string
  status: SubscriptionStatus
  startDate: string | null
  endDate: string | null
  trialEndDate: string | null
  gracePeriodEndDate: string | null
  cancelledAt: string | null
  cancelReason: string | null
  autoRenew: boolean
  billingCycle: BillingCycle | null
}

export type CreateSubscriptionRequest = {
  planId: string
  billingCycle: BillingCycle
  startWithTrial?: boolean
  autoRenew?: boolean
}

export function fetchCurrentSubscription(): Promise<Subscription> {
  return apiRequest<Subscription>('/api/subscriptions/current')
}

export function fetchPlans(): Promise<Plan[]> {
  return apiRequest<Plan[]>('/api/plans')
}

/** Create a new subscription (first time) */
export function createSubscription(body: CreateSubscriptionRequest): Promise<Subscription> {
  return apiRequest<Subscription>('/api/subscriptions', { method: 'POST', body })
}

/** Change the plan on an existing subscription */
export function changePlan(subscriptionId: string, planId: string): Promise<Subscription> {
  return apiRequest<Subscription>(`/api/subscriptions/${subscriptionId}/change-plan/${planId}`, {
    method: 'POST',
  })
}

/** Cancel a subscription */
export function cancelSubscription(subscriptionId: string, cancelReason?: string): Promise<Subscription> {
  return apiRequest<Subscription>(`/api/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    body: cancelReason ? { cancelReason } : undefined,
  })
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED'

export type Invoice = {
  id: string
  subscriptionId: string
  tenantId: string
  tenantName: string | null
  invoiceNumber: string
  amount: number
  currency: string
  status: InvoiceStatus
  issuedDate: string
  dueDate: string
  paidDate: string | null
  createdAt: string
  updatedAt: string
}

export function fetchInvoices(): Promise<Invoice[]> {
  return apiRequest<Invoice[]>('/api/invoices')
}

export function markInvoicePaid(invoiceId: string): Promise<Invoice> {
  return apiRequest<Invoice>(`/api/invoices/${invoiceId}/pay`, { method: 'POST' })
}

export function cancelInvoice(invoiceId: string): Promise<Invoice> {
  return apiRequest<Invoice>(`/api/invoices/${invoiceId}/cancel`, { method: 'POST' })
}
