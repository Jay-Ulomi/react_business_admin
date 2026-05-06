import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../features/auth/auth-context'
import { useBusinessContext } from '../features/context/business-context'
import { Modal } from '../features/ui/modal'
import { ConfirmModal, type ConfirmState } from '../features/ui/confirm-modal'
import { useToast } from '../features/ui/toast-context'
import { ApiError } from '../types/api'
import {
  createBranch,
  deactivateBranch,
  fetchBranches,
  updateBranch,
  type Branch,
} from '../features/branches/branches-api'
import {
  createBusinessUser,
  createBusinessTaxProfile,
  deactivateBusinessUser,
  disableTra,
  enableTra,
  fetchBusinessTaxProfile,
  fetchBusinessUsers,
  fetchRoles,
  fetchSystemRoles,
  seedBusinessDefaults,
  updateBusinessUser,
  updateBusinessTaxProfile,
  type FiscalMode,
  type BusinessTaxProfile,
  type BusinessUser,
  type Role,
} from '../features/settings/settings-api'

type SettingsTab = 'overview' | 'users' | 'branches' | 'tra'

function generateBranchCode(name: string): string {
  const cleaned = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .trim()
  if (!cleaned) return ''
  const parts = cleaned.split(/\s+/).filter(Boolean)
  const letters =
    parts.length >= 2 ? `${parts[0][0] ?? ''}${parts[1][0] ?? ''}${parts[0][1] ?? ''}` : cleaned.slice(0, 3)
  const random = String(Math.floor(100 + Math.random() * 900))
  return `${letters.padEnd(3, 'X').slice(0, 3)}-${random}`
}

function isRoleEnabled(role: Role): boolean {
  return role.isActive ?? role.active ?? false
}

function isBusinessAssignableRoleName(name?: string): boolean {
  return (name ?? '').trim().toLowerCase() !== 'platform_admin'
}

function isBranchEnabled(branch: Branch): boolean {
  return branch.isActive ?? branch.active ?? false
}

function branchTypeLabel(branch: Branch): string {
  if (branch.isWarehouse) return 'Warehouse'
  if (branch.isMainBranch) return 'Main'
  return 'Store'
}

export function SettingsPage() {
  const { session } = useAuth()
  const { selectedContext, loadContexts, businessAccesses, selectContext } = useBusinessContext()
  const { pushToast } = useToast()
  const [activeTab, setActiveTab] = useState<SettingsTab>('overview')
  const [users, setUsers] = useState<BusinessUser[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [roles, setRoles] = useState<Role[]>([])
  const [taxProfile, setTaxProfile] = useState<BusinessTaxProfile | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [seedingDefaults, setSeedingDefaults] = useState(false)
  const [branchSubmitting, setBranchSubmitting] = useState(false)
  const [userSubmitting, setUserSubmitting] = useState(false)
  const [taxSubmitting, setTaxSubmitting] = useState(false)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [taxModalOpen, setTaxModalOpen] = useState(false)
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false)
  const [editUserModalOpen, setEditUserModalOpen] = useState(false)
  const [editUserId, setEditUserId] = useState<string | null>(null)
  const [createUserForm, setCreateUserForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    roleId: '',
    branchIds: [] as string[],
  })
  const [editUserForm, setEditUserForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    roleId: '',
    isActive: true,
    branchIds: [] as string[],
  })
  const [createBranchModalOpen, setCreateBranchModalOpen] = useState(false)
  const [editBranchModalOpen, setEditBranchModalOpen] = useState(false)
  const [editBranchId, setEditBranchId] = useState<string | null>(null)
  const [createBranchStep, setCreateBranchStep] = useState<1 | 2>(1)
  const [codeEditedManually, setCodeEditedManually] = useState(false)
  const [createBranchForm, setCreateBranchForm] = useState({
    name: '',
    code: '',
    city: '',
    phone: '',
    email: '',
    address: '',
    isMainBranch: false,
    isWarehouse: false,
  })
  const [editBranchForm, setEditBranchForm] = useState({
    name: '',
    code: '',
    city: '',
    phone: '',
    email: '',
    address: '',
    isMainBranch: false,
    isWarehouse: false,
    isActive: true,
  })
  const [taxForm, setTaxForm] = useState({
    tin: '',
    vrn: '',
    receiptPrefix: '',
    certPath: '',
    serialNumber: '',
    taxOffice: '',
    fiscalMode: 'TEST' as FiscalMode,
    traEnabled: false,
    isActive: true,
  })
  const effectiveBusinessId = selectedContext?.businessId ?? businessAccesses[0]?.businessId ?? ''

  useEffect(() => {
    const businessId = effectiveBusinessId
    if (!businessId) {
      setLoading(false)
      return
    }
    let cancelled = false

    const run = async () => {
      setLoading(true)
      try {
        const usersPromise = fetchBusinessUsers(businessId)
        const rolesPromise = fetchRoles(businessId)
        const branchesPromise = fetchBranches(businessId)
        const taxProfilePromise = fetchBusinessTaxProfile(businessId).catch((err) => {
          if (err instanceof ApiError && err.status === 404) return null
          throw err
        })
        const [businessUsers, businessRoles, businessTaxProfile, businessBranches] = await Promise.all([
          usersPromise,
          rolesPromise,
          taxProfilePromise,
          branchesPromise,
        ])
        if (cancelled) return
        setUsers(businessUsers)
        let nextRoles = businessRoles.filter((role) => isRoleEnabled(role))
        if (!nextRoles.length) {
          const systemRoles = await fetchSystemRoles().catch(() => [])
          nextRoles = systemRoles.filter((role) => isRoleEnabled(role))
        }
        setRoles(nextRoles)
        setTaxProfile(businessTaxProfile)
        setBranches(businessBranches)
      } catch (err) {
        if (!cancelled) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to load settings data')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [effectiveBusinessId])

  useEffect(() => {
    if (selectedContext?.businessId) return
    const firstAccess = businessAccesses[0]
    const firstBranchId = firstAccess?.branchAccesses?.[0]?.branchId
    if (!firstAccess?.businessId || !firstBranchId) return
    void selectContext(firstAccess.businessId, firstBranchId).catch((err) => {
      pushToast('error', err instanceof Error ? err.message : 'Failed to initialize business context')
    })
  }, [businessAccesses, selectContext, selectedContext?.businessId])

  const activeUsers = useMemo(
    () => users.filter((user) => user.isActive ?? user.active ?? false).length,
    [users],
  )
  const activeBranches = useMemo(() => branches.filter((branch) => isBranchEnabled(branch)).length, [branches])
  const activeBranchIds = useMemo(
    () => branches.filter((branch) => isBranchEnabled(branch)).map((branch) => branch.id),
    [branches],
  )
  const activeRoles = useMemo(() => roles.filter((role) => isRoleEnabled(role)), [roles])
  const userDerivedRoles = useMemo(
    () =>
      users
        .filter((user) => Boolean(user.roleId))
        .map((user) => ({
          id: user.roleId as string,
          tenantId: user.tenantId,
          businessId: user.businessId,
          name: user.roleName ?? 'role',
          description: 'Derived from existing users',
          isSystemRole: false,
          isActive: true,
        }))
        .filter((role, index, arr) => arr.findIndex((r) => r.id === role.id) === index),
    [users],
  )
  const roleOptions = useMemo(
    () =>
      (activeRoles.length ? activeRoles : userDerivedRoles).filter((role) =>
        isBusinessAssignableRoleName(role.name),
      ),
    [activeRoles, userDerivedRoles],
  )
  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase()
    return users.filter((user) => {
      const isActive = user.isActive ?? user.active ?? false
      if (userStatusFilter === 'active' && !isActive) return false
      if (userStatusFilter === 'inactive' && isActive) return false
      if (!query) return true
      const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim().toLowerCase()
      const email = (user.email ?? '').toLowerCase()
      const roleName = (user.roleName ?? '').toLowerCase()
      const phone = (user.phone ?? '').toLowerCase()
      return fullName.includes(query) || email.includes(query) || roleName.includes(query) || phone.includes(query)
    })
  }, [userSearch, userStatusFilter, users])

  const refreshBranches = async (businessId: string) => {
    const rows = await fetchBranches(businessId)
    setBranches(rows)
    await loadContexts()
  }

  const refreshUsers = async (businessId: string) => {
    const rows = await fetchBusinessUsers(businessId)
    setUsers(rows)
  }

  const toggleBranchSelection = (branchId: string, currentBranchIds: string[]): string[] => {
    if (currentBranchIds.includes(branchId)) {
      return currentBranchIds.filter((id) => id !== branchId)
    }
    return [...currentBranchIds, branchId]
  }

  const findOtherActiveMainBranches = (excludeBranchId?: string): Branch[] =>
    branches.filter(
      (branch) => branch.id !== excludeBranchId && isBranchEnabled(branch) && (branch.isMainBranch ?? false),
    )

  const openCreateUserModal = () => {
    if (!effectiveBusinessId) {
      pushToast('error', 'Select a business context before creating a user.')
      return
    }
    if (!roleOptions.length) {
      pushToast('error', 'No active roles available for this business.')
      return
    }
    setCreateUserForm({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      phone: '',
      roleId: roleOptions[0]?.id ?? '',
      branchIds: activeBranchIds,
    })
    setCreateUserModalOpen(true)
  }

  const closeCreateUserModal = () => {
    if (userSubmitting) return
    setCreateUserModalOpen(false)
  }

  const submitCreateUser = async () => {
    const businessId = effectiveBusinessId
    if (!businessId || userSubmitting) return
    if (!createUserForm.firstName.trim() || !createUserForm.lastName.trim()) {
      pushToast('error', 'First name and last name are required.')
      return
    }
    if (!createUserForm.email.trim()) {
      pushToast('error', 'Email is required.')
      return
    }
    if (createUserForm.password.trim().length < 8) {
      pushToast('error', 'Password must be at least 8 characters.')
      return
    }
    if (!createUserForm.roleId) {
      pushToast('error', 'Role is required.')
      return
    }

    setUserSubmitting(true)
    try {
      await createBusinessUser({
        firstName: createUserForm.firstName.trim(),
        lastName: createUserForm.lastName.trim(),
        email: createUserForm.email.trim().toLowerCase(),
        password: createUserForm.password.trim(),
        phone: createUserForm.phone.trim() || undefined,
        businessId,
        roleId: createUserForm.roleId,
        branchIds: createUserForm.branchIds,
      })
      await refreshUsers(businessId)
      setCreateUserModalOpen(false)
      pushToast('success', 'Business user created successfully.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to create business user')
    } finally {
      setUserSubmitting(false)
    }
  }

  const openEditUserModal = (user: BusinessUser) => {
    setEditUserId(user.id)
    setEditUserForm({
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      phone: user.phone ?? '',
      roleId: user.roleId ?? '',
      isActive: user.isActive ?? user.active ?? true,
      branchIds: user.branchAccesses?.filter((access) => access.isActive).map((access) => access.branchId) ?? [],
    })
    setEditUserModalOpen(true)
  }

  const closeEditUserModal = () => {
    if (userSubmitting) return
    setEditUserModalOpen(false)
    setEditUserId(null)
  }

  const submitEditUser = async () => {
    const businessId = effectiveBusinessId
    if (!businessId || userSubmitting || !editUserId) return
    if (!editUserForm.firstName.trim() || !editUserForm.lastName.trim()) {
      pushToast('error', 'First name and last name are required.')
      return
    }
    if (!editUserForm.roleId) {
      pushToast('error', 'Role is required.')
      return
    }

    setUserSubmitting(true)
    try {
      await updateBusinessUser(editUserId, {
        firstName: editUserForm.firstName.trim(),
        lastName: editUserForm.lastName.trim(),
        phone: editUserForm.phone.trim() || undefined,
        roleId: editUserForm.roleId,
        isActive: editUserForm.isActive,
        branchIds: editUserForm.branchIds,
      })
      await refreshUsers(businessId)
      setEditUserModalOpen(false)
      setEditUserId(null)
      pushToast('success', 'Business user updated successfully.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to update business user')
    } finally {
      setUserSubmitting(false)
    }
  }

  const handleDeactivateUser = (user: BusinessUser) => {
    const businessId = effectiveBusinessId
    if (!businessId || userSubmitting) return
    if (!(user.isActive ?? user.active ?? false)) return
    setConfirmState({
      title: 'Deactivate user',
      message: `Deactivate user "${user.email}"?`,
      confirmLabel: 'Deactivate',
      destructive: true,
      onConfirm: async () => {
        setConfirmState(null)
        setUserSubmitting(true)
        try {
          await deactivateBusinessUser(user.id)
          await refreshUsers(businessId)
          pushToast('success', `User "${user.email}" deactivated.`)
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to deactivate user')
        } finally {
          setUserSubmitting(false)
        }
      },
    })
  }

  const openTaxModal = () => {
    setTaxForm({
      tin: taxProfile?.tin ?? '',
      vrn: taxProfile?.vrn ?? '',
      receiptPrefix: taxProfile?.receiptPrefix ?? '',
      certPath: '',
      serialNumber: taxProfile?.serialNumber ?? '',
      taxOffice: taxProfile?.taxOffice ?? '',
      fiscalMode: (taxProfile?.fiscalMode as FiscalMode | undefined) ?? 'TEST',
      traEnabled: taxProfile?.traEnabled ?? false,
      isActive: taxProfile?.isActive ?? taxProfile?.active ?? true,
    })
    setTaxModalOpen(true)
  }

  const closeTaxModal = () => {
    if (taxSubmitting) return
    setTaxModalOpen(false)
  }

  const submitTaxProfile = async () => {
    const businessId = effectiveBusinessId
    if (!businessId || taxSubmitting) return
    if (!taxForm.tin.trim()) {
      pushToast('error', 'TIN is required.')
      return
    }
    setTaxSubmitting(true)
    try {
      const payload = {
        tin: taxForm.tin.trim(),
        vrn: taxForm.vrn.trim() || undefined,
        receiptPrefix: taxForm.receiptPrefix.trim() || undefined,
        certPath: taxForm.certPath.trim() || undefined,
        serialNumber: taxForm.serialNumber.trim() || undefined,
        taxOffice: taxForm.taxOffice.trim() || undefined,
        fiscalMode: taxForm.fiscalMode,
        traEnabled: taxForm.traEnabled,
        isActive: taxForm.isActive,
      }
      const nextProfile = taxProfile
        ? await updateBusinessTaxProfile(businessId, payload)
        : await createBusinessTaxProfile({ businessId, ...payload })
      setTaxProfile(nextProfile)
      setTaxModalOpen(false)
      pushToast('success', taxProfile ? 'TRA profile updated successfully.' : 'TRA profile created successfully.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to save TRA profile')
    } finally {
      setTaxSubmitting(false)
    }
  }

  const toggleTraEnabled = async () => {
    const businessId = effectiveBusinessId
    if (!businessId || taxSubmitting || !taxProfile) return
    setTaxSubmitting(true)
    try {
      const nextProfile = taxProfile.traEnabled ? await disableTra(businessId) : await enableTra(businessId)
      setTaxProfile(nextProfile)
      pushToast('success', taxProfile.traEnabled ? 'TRA integration disabled.' : 'TRA integration enabled.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to change TRA integration status')
    } finally {
      setTaxSubmitting(false)
    }
  }

  const openCreateBranchModal = () => {
    if (!effectiveBusinessId) {
      pushToast('error', 'Select a business context before creating a branch.')
      return
    }
    setCreateBranchForm({
      name: '',
      code: '',
      city: '',
      phone: '',
      email: '',
      address: '',
      isMainBranch: false,
      isWarehouse: false,
    })
    setCodeEditedManually(false)
    setCreateBranchStep(1)
    setCreateBranchModalOpen(true)
  }

  const closeCreateBranchModal = () => {
    if (branchSubmitting) return
    setCreateBranchModalOpen(false)
    setCreateBranchStep(1)
  }

  const openEditBranchModal = (branch: Branch) => {
    setEditBranchId(branch.id)
    setEditBranchForm({
      name: branch.name ?? '',
      code: branch.code ?? '',
      city: branch.city ?? '',
      phone: branch.phone ?? '',
      email: branch.email ?? '',
      address: branch.address ?? '',
      isMainBranch: branch.isMainBranch ?? false,
      isWarehouse: branch.isWarehouse ?? false,
      isActive: isBranchEnabled(branch),
    })
    setEditBranchModalOpen(true)
  }

  const closeEditBranchModal = () => {
    if (branchSubmitting) return
    setEditBranchModalOpen(false)
    setEditBranchId(null)
  }

  const doCreateBranch = async (businessId: string, conflictingMainBranches: Branch[]) => {
    setBranchSubmitting(true)
    try {
      await createBranch(businessId, {
        name: createBranchForm.name.trim(),
        code: createBranchForm.code.trim() || undefined,
        city: createBranchForm.city.trim() || undefined,
        phone: createBranchForm.phone.trim() || undefined,
        email: createBranchForm.email.trim() || undefined,
        address: createBranchForm.address.trim() || undefined,
        isMainBranch: createBranchForm.isMainBranch,
        isWarehouse: createBranchForm.isWarehouse,
      })
      if (createBranchForm.isMainBranch && conflictingMainBranches.length) {
        await Promise.all(
          conflictingMainBranches.map((branch) =>
            updateBranch(businessId, branch.id, {
              isMainBranch: false,
            }),
          ),
        )
      }
      await refreshBranches(businessId)
      setCreateBranchModalOpen(false)
      setCreateBranchStep(1)
      setCodeEditedManually(false)
      pushToast('success', 'Branch created successfully.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to create branch')
    } finally {
      setBranchSubmitting(false)
    }
  }

  const submitCreateBranch = () => {
    const businessId = effectiveBusinessId
    if (branchSubmitting) return
    if (!businessId) {
      pushToast('error', 'No business selected for branch creation.')
      return
    }
    if (!createBranchForm.name.trim()) {
      pushToast('error', 'Branch name is required.')
      return
    }
    const conflictingMainBranches = createBranchForm.isMainBranch ? findOtherActiveMainBranches() : []
    if (conflictingMainBranches.length) {
      setConfirmState({
        title: 'Replace main branch',
        message:
          `Another main branch exists (${conflictingMainBranches.map((b) => b.name).join(', ')}). ` +
          'Continue and automatically unset the previous main branch(es)?',
        confirmLabel: 'Continue',
        destructive: false,
        onConfirm: async () => {
          setConfirmState(null)
          await doCreateBranch(businessId, conflictingMainBranches)
        },
      })
      return
    }
    void doCreateBranch(businessId, conflictingMainBranches)
  }

  const doEditBranch = async (businessId: string, branchId: string, conflictingMainBranches: Branch[]) => {
    setBranchSubmitting(true)
    try {
      await updateBranch(businessId, branchId, {
        name: editBranchForm.name.trim(),
        code: editBranchForm.code.trim() || undefined,
        city: editBranchForm.city.trim() || undefined,
        phone: editBranchForm.phone.trim() || undefined,
        email: editBranchForm.email.trim() || undefined,
        address: editBranchForm.address.trim() || undefined,
        isMainBranch: editBranchForm.isMainBranch,
        isWarehouse: editBranchForm.isWarehouse,
        isActive: editBranchForm.isActive,
      })
      if (editBranchForm.isMainBranch && conflictingMainBranches.length) {
        await Promise.all(
          conflictingMainBranches.map((branch) =>
            updateBranch(businessId, branch.id, {
              isMainBranch: false,
            }),
          ),
        )
      }
      await refreshBranches(businessId)
      setEditBranchModalOpen(false)
      setEditBranchId(null)
      pushToast('success', 'Branch updated successfully.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to update branch')
    } finally {
      setBranchSubmitting(false)
    }
  }

  const submitEditBranch = () => {
    const businessId = effectiveBusinessId
    if (!businessId || branchSubmitting || !editBranchId) return
    if (!editBranchForm.name.trim()) {
      pushToast('error', 'Branch name is required.')
      return
    }
    const branchId = editBranchId
    const conflictingMainBranches = editBranchForm.isMainBranch ? findOtherActiveMainBranches(branchId) : []
    if (conflictingMainBranches.length) {
      setConfirmState({
        title: 'Replace main branch',
        message:
          `Another main branch exists (${conflictingMainBranches.map((b) => b.name).join(', ')}). ` +
          'Continue and automatically unset the previous main branch(es)?',
        confirmLabel: 'Continue',
        destructive: false,
        onConfirm: async () => {
          setConfirmState(null)
          await doEditBranch(businessId, branchId, conflictingMainBranches)
        },
      })
      return
    }
    void doEditBranch(businessId, branchId, conflictingMainBranches)
  }

  const handleDeactivateBranch = (branch: Branch) => {
    const businessId = effectiveBusinessId
    if (!businessId || branchSubmitting) return
    setConfirmState({
      title: 'Deactivate branch',
      message: `Deactivate branch "${branch.name}"?`,
      confirmLabel: 'Deactivate',
      destructive: true,
      onConfirm: async () => {
        setConfirmState(null)
        setBranchSubmitting(true)
        try {
          await deactivateBranch(businessId, branch.id)
          await refreshBranches(businessId)
          pushToast('success', `Branch "${branch.name}" deactivated.`)
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to deactivate branch')
        } finally {
          setBranchSubmitting(false)
        }
      },
    })
  }

  const handleSeedDefaults = () => {
    const businessId = selectedContext?.businessId
    if (!businessId) return
    setConfirmState({
      title: 'Seed default categories & units',
      message: 'This will add default categories and units for the current business type. Any existing categories/units will remain. Continue?',
      confirmLabel: 'Seed',
      destructive: false,
      onConfirm: async () => {
        setConfirmState(null)
        setSeedingDefaults(true)
        try {
          await seedBusinessDefaults(businessId)
          pushToast('success', 'Default categories and units seeded successfully.')
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to seed defaults')
        } finally {
          setSeedingDefaults(false)
        }
      },
    })
  }

  const tabButtonClass = (tab: SettingsTab) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
      activeTab === tab
        ? 'bg-emerald-700 text-white'
        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
    }`

  const stepButtonClass = (step: 1 | 2) =>
    `grid h-8 w-8 place-items-center rounded-full border text-sm font-semibold ${
      createBranchStep === step
        ? 'border-emerald-700 bg-emerald-700 text-white'
        : 'border-slate-300 bg-white text-slate-700'
    }`

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Settings</p>
      <h2 className="mt-1 font-display text-2xl text-slate-900">Business Context, Account, and Integration</h2>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setActiveTab('overview')} className={tabButtonClass('overview')}>
          Overview
        </button>
        <button type="button" onClick={() => setActiveTab('users')} className={tabButtonClass('users')}>
          Users
        </button>
        <button type="button" onClick={() => setActiveTab('branches')} className={tabButtonClass('branches')}>
          Branches
        </button>
        <button type="button" onClick={() => setActiveTab('tra')} className={tabButtonClass('tra')}>
          TRA
        </button>
      </div>

      {loading ? <p className="mt-3 text-sm text-slate-500">Loading settings data...</p> : null}

      <div className="mt-5">
        {activeTab === 'overview' ? (
          <div>
            <div className="mb-4">
              <button
                type="button"
                onClick={handleSeedDefaults}
                disabled={seedingDefaults || !selectedContext?.businessId}
                title="Seeds default categories and units for this business. Only needed for legacy businesses created before auto-seeding."
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {seedingDefaults ? 'Seeding...' : 'Seed Default Categories & Units'}
              </button>
            </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-display text-lg text-slate-900">Account</h3>
              <p className="mt-2 text-sm text-slate-700">Email: {session?.email ?? '-'}</p>
              <p className="text-sm text-slate-700">User ID: {session?.userId ?? '-'}</p>
              <p className="text-sm text-slate-700">Role: {session?.role ?? '-'}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-display text-lg text-slate-900">Active Context</h3>
              <p className="mt-2 text-sm text-slate-700">Business: {selectedContext?.businessName ?? '-'}</p>
              <p className="text-sm text-slate-700">Branch: {selectedContext?.branchName ?? '-'}</p>
              <p className="text-sm text-slate-700">Tenant ID: {selectedContext?.tenantId ?? '-'}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-display text-lg text-slate-900">Business Users</h3>
              <p className="mt-2 text-sm text-slate-700">Total: {users.length}</p>
              <p className="text-sm text-slate-700">Active: {activeUsers}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-display text-lg text-slate-900">Branches</h3>
              <p className="mt-2 text-sm text-slate-700">Total: {branches.length}</p>
              <p className="text-sm text-slate-700">Active: {activeBranches}</p>
            </article>
          </div>
          </div>
        ) : null}

        {activeTab === 'users' ? (
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg text-slate-900">Business Users</h3>
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-700">
                  Total: {users.length} | Active: {activeUsers}
                </p>
                <button
                  type="button"
                  onClick={openCreateUserModal}
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  Add User
                </button>
              </div>
            </div>
            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
              <input
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Search by name, email, role, phone"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
              <select
                value={userStatusFilter}
                onChange={(event) => setUserStatusFilter(event.target.value as 'all' | 'active' | 'inactive')}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
            </div>
            <div className="mt-3 space-y-2">
              {filteredUsers.map((user) => (
                <div key={user.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">
                        {user.firstName || user.lastName
                          ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
                          : user.email}
                      </p>
                      <p className="text-slate-600">{user.email}</p>
                      <p className="text-xs text-slate-500">Role: {user.roleName ?? 'N/A'}</p>
                      <p className="text-xs text-slate-500">Phone: {user.phone || '-'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          (user.isActive ?? user.active)
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {(user.isActive ?? user.active) ? 'Active' : 'Inactive'}
                      </span>
                      <button
                        type="button"
                        onClick={() => openEditUserModal(user)}
                        className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeactivateUser(user)}
                        disabled={!(user.isActive ?? user.active) || userSubmitting}
                        className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Deactivate
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!filteredUsers.length ? <p className="text-sm text-slate-600">No users match current filters.</p> : null}
            </div>
          </article>
        ) : null}

        {activeTab === 'branches' ? (
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg text-slate-900">Branch Management</h3>
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-600">
                  Total: {branches.length} | Active: {activeBranches}
                </p>
                <button
                  type="button"
                  onClick={openCreateBranchModal}
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  Create Branch
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">Name</th>
                    <th className="px-2 py-2 font-medium">Code</th>
                    <th className="px-2 py-2 font-medium">City</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Type</th>
                    <th className="px-2 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((branch) => (
                    <tr key={branch.id} className="border-b border-slate-100">
                      <td className="px-2 py-3 font-medium text-slate-800">{branch.name}</td>
                      <td className="px-2 py-3 text-slate-700">{branch.code || '-'}</td>
                      <td className="px-2 py-3 text-slate-700">{branch.city || '-'}</td>
                      <td className="px-2 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            isBranchEnabled(branch) ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isBranchEnabled(branch) ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-slate-700">{branchTypeLabel(branch)}</td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditBranchModal(branch)}
                            className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeactivateBranch(branch)}
                            disabled={!isBranchEnabled(branch) || branchSubmitting}
                            className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!branches.length ? (
                    <tr>
                      <td colSpan={6} className="px-2 py-3 text-slate-500">
                        No branches found for this business.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}

        {activeTab === 'tra' ? (
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg text-slate-900">TRA Profile</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openTaxModal}
                  className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  {taxProfile ? 'Edit Profile' : 'Create Profile'}
                </button>
                {taxProfile ? (
                  <button
                    type="button"
                    onClick={toggleTraEnabled}
                    disabled={taxSubmitting}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${
                      taxProfile.traEnabled ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-700 hover:bg-emerald-800'
                    }`}
                  >
                    {taxSubmitting ? 'Processing...' : taxProfile.traEnabled ? 'Disable TRA' : 'Enable TRA'}
                  </button>
                ) : null}
              </div>
            </div>
            {taxProfile ? (
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-slate-700 md:grid-cols-3">
                <p>TIN: {taxProfile.tin || '-'}</p>
                <p>VRN: {taxProfile.vrn || '-'}</p>
                <p>Receipt Prefix: {taxProfile.receiptPrefix || '-'}</p>
                <p>Serial Number: {taxProfile.serialNumber || '-'}</p>
                <p>Tax Office: {taxProfile.taxOffice || '-'}</p>
                <p>Fiscal Mode: {taxProfile.fiscalMode || '-'}</p>
                <p>Compliance: {taxProfile.complianceStatus || '-'}</p>
                <p>TRA Enabled: {taxProfile.traEnabled ? 'Yes' : 'No'}</p>
                <p>Status: {taxProfile.isActive ?? taxProfile.active ? 'Active' : 'Inactive'}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">No TRA profile configured for this business yet.</p>
            )}
          </article>
        ) : null}
      </div>

      {createUserModalOpen ? (
        <Modal title="Add Business User" onClose={closeCreateUserModal} maxWidthClass="max-w-2xl">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              value={createUserForm.firstName}
              onChange={(event) => setCreateUserForm((prev) => ({ ...prev, firstName: event.target.value }))}
              placeholder="First name *"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={createUserForm.lastName}
              onChange={(event) => setCreateUserForm((prev) => ({ ...prev, lastName: event.target.value }))}
              placeholder="Last name *"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={createUserForm.email}
              onChange={(event) => setCreateUserForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="Email *"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
            />
            <input
              value={createUserForm.password}
              onChange={(event) => setCreateUserForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Password (min 8 chars) *"
              type="password"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={createUserForm.phone}
              onChange={(event) => setCreateUserForm((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="Phone"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={createUserForm.roleId}
              onChange={(event) => setCreateUserForm((prev) => ({ ...prev, roleId: event.target.value }))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
            >
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Branch Access</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateUserForm((prev) => ({ ...prev, branchIds: activeBranchIds }))}
                    className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateUserForm((prev) => ({ ...prev, branchIds: [] }))}
                    className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Clear All
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {branches
                  .filter((branch) => isBranchEnabled(branch))
                  .map((branch) => (
                    <label key={branch.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={createUserForm.branchIds.includes(branch.id)}
                        onChange={() =>
                          setCreateUserForm((prev) => ({
                            ...prev,
                            branchIds: toggleBranchSelection(branch.id, prev.branchIds),
                          }))
                        }
                      />
                      {branch.name}
                    </label>
                  ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeCreateUserModal}
              disabled={userSubmitting}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitCreateUser}
              disabled={userSubmitting}
              className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {userSubmitting ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </Modal>
      ) : null}

      {editUserModalOpen ? (
        <Modal title="Edit Business User" onClose={closeEditUserModal} maxWidthClass="max-w-2xl">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              value={editUserForm.firstName}
              onChange={(event) => setEditUserForm((prev) => ({ ...prev, firstName: event.target.value }))}
              placeholder="First name *"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={editUserForm.lastName}
              onChange={(event) => setEditUserForm((prev) => ({ ...prev, lastName: event.target.value }))}
              placeholder="Last name *"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={editUserForm.phone}
              onChange={(event) => setEditUserForm((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="Phone"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
            />
            <select
              value={editUserForm.roleId}
              onChange={(event) => setEditUserForm((prev) => ({ ...prev, roleId: event.target.value }))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
            >
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 md:col-span-2">
              <input
                type="checkbox"
                checked={editUserForm.isActive}
                onChange={(event) => setEditUserForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              User active
            </label>
            <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Branch Access</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditUserForm((prev) => ({ ...prev, branchIds: activeBranchIds }))}
                    className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditUserForm((prev) => ({ ...prev, branchIds: [] }))}
                    className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Clear All
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {branches
                  .filter((branch) => isBranchEnabled(branch))
                  .map((branch) => (
                    <label key={branch.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={editUserForm.branchIds.includes(branch.id)}
                        onChange={() =>
                          setEditUserForm((prev) => ({
                            ...prev,
                            branchIds: toggleBranchSelection(branch.id, prev.branchIds),
                          }))
                        }
                      />
                      {branch.name}
                    </label>
                  ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeEditUserModal}
              disabled={userSubmitting}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitEditUser}
              disabled={userSubmitting}
              className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {userSubmitting ? 'Saving...' : 'Save User'}
            </button>
          </div>
        </Modal>
      ) : null}

      {editBranchModalOpen ? (
        <Modal title="Edit Branch" onClose={closeEditBranchModal} maxWidthClass="max-w-2xl">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              value={editBranchForm.name}
              onChange={(event) => setEditBranchForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Branch name *"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={editBranchForm.code}
              onChange={(event) => setEditBranchForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
              placeholder="Branch code"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={editBranchForm.city}
              onChange={(event) => setEditBranchForm((prev) => ({ ...prev, city: event.target.value }))}
              placeholder="City"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={editBranchForm.phone}
              onChange={(event) => setEditBranchForm((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="Phone"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={editBranchForm.email}
              onChange={(event) => setEditBranchForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="Email"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
            />
            <textarea
              value={editBranchForm.address}
              onChange={(event) => setEditBranchForm((prev) => ({ ...prev, address: event.target.value }))}
              placeholder="Address"
              rows={3}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
            />
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={editBranchForm.isMainBranch}
                onChange={(event) => setEditBranchForm((prev) => ({ ...prev, isMainBranch: event.target.checked }))}
              />
              Set as main branch
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={editBranchForm.isWarehouse}
                onChange={(event) => setEditBranchForm((prev) => ({ ...prev, isWarehouse: event.target.checked }))}
              />
              Mark as warehouse
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={editBranchForm.isActive}
                onChange={(event) => setEditBranchForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Branch active
            </label>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeEditBranchModal}
              disabled={branchSubmitting}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitEditBranch}
              disabled={branchSubmitting}
              className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {branchSubmitting ? 'Saving...' : 'Save Branch'}
            </button>
          </div>
        </Modal>
      ) : null}

      {taxModalOpen ? (
        <Modal title={taxProfile ? 'Edit TRA Profile' : 'Create TRA Profile'} onClose={closeTaxModal}>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              value={taxForm.tin}
              onChange={(event) => setTaxForm((prev) => ({ ...prev, tin: event.target.value }))}
              placeholder="TIN *"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={taxForm.vrn}
              onChange={(event) => setTaxForm((prev) => ({ ...prev, vrn: event.target.value }))}
              placeholder="VRN"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={taxForm.receiptPrefix}
              onChange={(event) => setTaxForm((prev) => ({ ...prev, receiptPrefix: event.target.value }))}
              placeholder="Receipt prefix"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={taxForm.serialNumber}
              onChange={(event) => setTaxForm((prev) => ({ ...prev, serialNumber: event.target.value }))}
              placeholder="Serial number"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={taxForm.taxOffice}
              onChange={(event) => setTaxForm((prev) => ({ ...prev, taxOffice: event.target.value }))}
              placeholder="Tax office"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={taxForm.fiscalMode}
              onChange={(event) => setTaxForm((prev) => ({ ...prev, fiscalMode: event.target.value as FiscalMode }))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="TEST">TEST</option>
              <option value="LIVE">LIVE</option>
            </select>
            <input
              value={taxForm.certPath}
              onChange={(event) => setTaxForm((prev) => ({ ...prev, certPath: event.target.value }))}
              placeholder="Certificate path (optional)"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
            />
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={taxForm.traEnabled}
                onChange={(event) => setTaxForm((prev) => ({ ...prev, traEnabled: event.target.checked }))}
              />
              Enable TRA integration
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={taxForm.isActive}
                onChange={(event) => setTaxForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Profile active
            </label>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeTaxModal}
              disabled={taxSubmitting}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitTaxProfile}
              disabled={taxSubmitting || !taxForm.tin.trim()}
              className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {taxSubmitting ? 'Saving...' : taxProfile ? 'Save Profile' : 'Create Profile'}
            </button>
          </div>
        </Modal>
      ) : null}

      {confirmState ? (
        <ConfirmModal
          {...confirmState}
          onClose={() => setConfirmState(null)}
        />
      ) : null}

      {createBranchModalOpen ? (
        <Modal title={`Step ${createBranchStep} of 2`} onClose={closeCreateBranchModal} maxWidthClass="max-w-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Create Branch</p>
                <h3 className="font-display text-xl text-slate-900">
                  {createBranchStep === 1 ? 'Branch Identity' : 'Branch Contacts'}
                </h3>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className={stepButtonClass(1)}
                    onClick={() => setCreateBranchStep(1)}
                    disabled={branchSubmitting}
                  >
                    1
                  </button>
                  <span className="h-[2px] w-10 bg-slate-300" />
                  <button
                    type="button"
                    className={stepButtonClass(2)}
                    onClick={() => {
                      if (!createBranchForm.name.trim()) {
                        pushToast('info', 'Enter branch name before moving to step 2.')
                        return
                      }
                      setCreateBranchStep(2)
                    }}
                    disabled={branchSubmitting}
                  >
                    2
                  </button>
                </div>
              </div>
            </div>

            {createBranchStep === 1 ? (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <input
                  value={createBranchForm.name}
                  onChange={(event) =>
                    setCreateBranchForm((prev) => {
                      const nextName = event.target.value
                      return {
                        ...prev,
                        name: nextName,
                        code: codeEditedManually ? prev.code : generateBranchCode(nextName),
                      }
                    })
                  }
                  placeholder="Branch name *"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
                />
                <div className="flex gap-1">
                  <input
                    value={createBranchForm.code}
                    onChange={(event) => {
                      setCodeEditedManually(true)
                      setCreateBranchForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))
                    }}
                    placeholder="Branch code"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCodeEditedManually(false)
                      setCreateBranchForm((prev) => ({ ...prev, code: generateBranchCode(prev.name) }))
                    }}
                    className="rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    title="Auto generate code"
                  >
                    Auto
                  </button>
                </div>
                <input
                  value={createBranchForm.city}
                  onChange={(event) => setCreateBranchForm((prev) => ({ ...prev, city: event.target.value }))}
                  placeholder="City"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-3"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <input
                  value={createBranchForm.phone}
                  onChange={(event) => setCreateBranchForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="Phone"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  value={createBranchForm.email}
                  onChange={(event) => setCreateBranchForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="Email"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
                />
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 md:col-span-3">
                  <input
                    type="checkbox"
                    checked={createBranchForm.isMainBranch}
                    onChange={(event) =>
                      setCreateBranchForm((prev) => ({ ...prev, isMainBranch: event.target.checked }))
                    }
                  />
                  Set as main branch
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 md:col-span-3">
                  <input
                    type="checkbox"
                    checked={createBranchForm.isWarehouse}
                    onChange={(event) =>
                      setCreateBranchForm((prev) => ({ ...prev, isWarehouse: event.target.checked }))
                    }
                  />
                  Mark as warehouse
                </label>
                <textarea
                  value={createBranchForm.address}
                  onChange={(event) => setCreateBranchForm((prev) => ({ ...prev, address: event.target.value }))}
                  placeholder="Address"
                  rows={3}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-3"
                />
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCreateBranchStep(1)}
                disabled={createBranchStep === 1 || branchSubmitting}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeCreateBranchModal}
                  disabled={branchSubmitting}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                {createBranchStep === 1 ? (
                  <button
                    type="button"
                    onClick={() => setCreateBranchStep(2)}
                    disabled={!createBranchForm.name.trim()}
                    className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submitCreateBranch}
                    disabled={branchSubmitting || !createBranchForm.name.trim()}
                    className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                  >
                    {branchSubmitting ? 'Creating...' : 'Create Branch'}
                  </button>
                )}
              </div>
            </div>
        </Modal>
      ) : null}

    </section>
  )
}
