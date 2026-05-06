export type AuthResponse = {
  accessToken: string
  refreshToken: string
  tokenType?: string
  userId: string
  email: string
  firstName?: string
  lastName?: string
  role?: string
}

export type LoginRequest = {
  email: string
  password: string
}

export type AuthSession = {
  accessToken: string
  refreshToken: string
  userId: string
  email: string
  firstName?: string
  lastName?: string
  role?: string
}

export type BusinessAccess = {
  id: string
  userId: string
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  businessId: string
  businessName: string
  tenantId: string
  roleId: string
  roleName: string
  businessType?: string
  isActive: boolean
  branchAccesses: BranchAccess[]
}

export type BranchAccess = {
  id: string
  branchId: string
  branchName: string
  isActive: boolean
}

export type BranchResponse = {
  id: string
  businessId: string
  tenantId: string
  name: string
  code?: string
  address?: string
  city?: string
  phone?: string
  email?: string
  isActive: boolean
  active?: boolean
  isMainBranch: boolean
}

export type SwitchContextRequest = {
  businessId: string
  branchId: string
}

export type SwitchContextResponse = {
  accessToken: string
  refreshToken: string
  tokenType?: string
  userId: string
  email: string
  tenantId: string
  businessId: string
  businessName: string
  branchId: string
  branchName: string
  roleName: string
}

export type BusinessContextSelection = {
  businessId: string
  businessName: string
  businessType?: string
  branchId: string
  branchName: string
  tenantId?: string
  roleName?: string
}
