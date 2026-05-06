import { apiRequest } from '../../lib/http'

export type PublicPlanFeature = {
  id: string
  featureName: string
  featureValue?: string
  isEnabled: boolean
}

export type PublicPlan = {
  id: string
  name: string
  description?: string
  monthlyPrice: number
  annualPrice: number
  trialDays: number
  isDefault: boolean
  maxBusinesses: number
  maxBranches: number
  maxUsers: number
  sortOrder: number
  features?: PublicPlanFeature[]
}

export type RegisterBusinessPayload = {
  businessName: string
  businessPhone?: string
  businessAddress?: string
  businessType?: string
  planId?: string
  billingCycle?: 'MONTHLY' | 'ANNUAL'
  startWithTrial?: boolean
  ownerFirstName: string
  ownerLastName: string
  ownerEmail: string
  ownerPassword: string
  ownerPhone?: string
}

export type DemoRequestPayload = {
  name: string
  email: string
  phone?: string
  businessName?: string
  message?: string
}

export type DemoAccess = {
  loginEmail: string
  loginPassword: string
  loginPath: string
  note?: string
}

export async function fetchPublicPlans(): Promise<PublicPlan[]> {
  return apiRequest<PublicPlan[]>('/api/plans')
}

export async function registerBusiness(payload: RegisterBusinessPayload): Promise<void> {
  await apiRequest('/api/public/onboarding/register-business', {
    method: 'POST',
    body: payload,
  })
}

export async function requestDemo(payload: DemoRequestPayload): Promise<DemoAccess> {
  return apiRequest<DemoAccess>('/api/public/onboarding/request-demo', {
    method: 'POST',
    body: payload,
  })
}
