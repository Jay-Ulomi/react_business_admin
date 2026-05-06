import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  adjustCustomerBalance,
  adjustLoyaltyPoints,
  createCustomer,
  deactivateCustomer,
  fetchCustomer,
  fetchCustomers,
  updateCustomer,
  type CustomerResponse,
  type CustomerType,
} from '../features/customers/customers-api'
import {
  fetchCustomerGroups,
  type CustomerGroupResponse,
} from '../features/customers/customer-groups-api'
import { Modal } from '../features/ui/modal'
import { ConfirmModal, type ConfirmState } from '../features/ui/confirm-modal'
import { useToast } from '../features/ui/toast-context'
import { formatCurrency } from '../lib/format'

type StatusFilter = 'all' | 'active' | 'inactive'

type CustomerFormState = {
  code: string
  name: string
  contactPerson: string
  phone: string
  email: string
  address: string
  city: string
  country: string
  taxId: string
  customerType: CustomerType | ''
  creditLimit: string
  loyaltyPoints: string
  customerGroupId: string
  notes: string
  dateOfBirth: string
  gender: string
  isActive: boolean
}

const emptyForm: CustomerFormState = {
  code: '',
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  country: '',
  taxId: '',
  customerType: '',
  creditLimit: '',
  loyaltyPoints: '',
  customerGroupId: '',
  notes: '',
  dateOfBirth: '',
  gender: '',
  isActive: true,
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function parseSortDir(value: string | null, fallback: 'asc' | 'desc'): 'asc' | 'desc' {
  return value === 'asc' || value === 'desc' ? value : fallback
}

function parseStatus(value: string | null, fallback: StatusFilter): StatusFilter {
  return value === 'all' || value === 'active' || value === 'inactive' ? value : fallback
}

function customerFromResponse(customer: CustomerResponse): CustomerFormState {
  return {
    code: customer.code ?? '',
    name: customer.name ?? '',
    contactPerson: customer.contactPerson ?? '',
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    address: customer.address ?? '',
    city: customer.city ?? '',
    country: customer.country ?? '',
    taxId: customer.taxId ?? '',
    customerType: customer.customerType ?? '',
    creditLimit: customer.creditLimit == null ? '' : String(customer.creditLimit),
    loyaltyPoints: customer.loyaltyPoints == null ? '' : String(customer.loyaltyPoints),
    customerGroupId: customer.customerGroupId ?? '',
    notes: customer.notes ?? '',
    dateOfBirth: customer.dateOfBirth ?? '',
    gender: customer.gender ?? '',
    isActive: customer.isActive,
  }
}

export function CustomersPage() {
  const { pushToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [customers, setCustomers] = useState<CustomerResponse[]>([])
  const [groups, setGroups] = useState<CustomerGroupResponse[]>([])

  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [groupFilter, setGroupFilter] = useState(searchParams.get('groupId') ?? '')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    parseStatus(searchParams.get('status'), 'active'),
  )
  const [page, setPage] = useState(parsePositiveInt(searchParams.get('page'), 0))
  const [size, setSize] = useState(parsePositiveInt(searchParams.get('size'), 20))
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') ?? 'updatedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    parseSortDir(searchParams.get('sortDir'), 'desc'),
  )
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<CustomerFormState>(emptyForm)

  const [editOpen, setEditOpen] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editCustomerId, setEditCustomerId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<CustomerFormState>(emptyForm)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailCustomer, setDetailCustomer] = useState<CustomerResponse | null>(null)
  const [loyaltyDelta, setLoyaltyDelta] = useState('')
  const [loyaltySubmitting, setLoyaltySubmitting] = useState(false)
  const [balanceDelta, setBalanceDelta] = useState('')
  const [balanceSubmitting, setBalanceSubmitting] = useState(false)

  useEffect(() => {
    const next = new URLSearchParams()
    if (search) next.set('q', search)
    if (groupFilter) next.set('groupId', groupFilter)
    if (statusFilter !== 'active') next.set('status', statusFilter)
    if (sortBy !== 'updatedAt') next.set('sortBy', sortBy)
    if (sortDir !== 'desc') next.set('sortDir', sortDir)
    if (page !== 0) next.set('page', String(page))
    if (size !== 20) next.set('size', String(size))
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [groupFilter, page, search, searchParams, setSearchParams, size, sortBy, sortDir, statusFilter])

  useEffect(() => {
    let cancelled = false
    const timeout = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const [response, groupRows] = await Promise.all([
          fetchCustomers({
            search: search.trim() || undefined,
            customerGroupId: groupFilter || undefined,
            isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
            page,
            size,
            sortBy,
            sortDir,
          }),
          fetchCustomerGroups().catch(() => [] as CustomerGroupResponse[]),
        ])
        if (!cancelled) {
          setCustomers(response.content)
          setTotalPages(response.totalPages)
          setTotalElements(response.totalElements)
          setGroups(groupRows)
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load customers'
          setError(message)
          pushToast('error', message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [groupFilter, page, refreshKey, search, size, sortBy, sortDir, statusFilter, pushToast])

  const activeGroups = useMemo(() => groups.filter((group) => group.isActive), [groups])
  const groupName = (id?: string): string =>
    id ? groups.find((group) => group.id === id)?.name ?? '-' : '-'

  const openCreate = () => {
    setCreateForm(emptyForm)
    setCreateError(null)
    setCreateOpen(true)
  }

  const closeCreate = () => {
    if (createSubmitting) return
    setCreateOpen(false)
    setCreateError(null)
  }

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateError(null)

    if (!createForm.name.trim()) {
      setCreateError('Customer name is required.')
      pushToast('error', 'Customer name is required.')
      return
    }
    const creditLimit =
      createForm.creditLimit.trim() === '' ? undefined : Number(createForm.creditLimit)
    if (creditLimit !== undefined && (!Number.isFinite(creditLimit) || creditLimit < 0)) {
      setCreateError('Credit limit must be a non-negative number.')
      pushToast('error', 'Credit limit must be a non-negative number.')
      return
    }
    const loyaltyPoints =
      createForm.loyaltyPoints.trim() === '' ? undefined : Number(createForm.loyaltyPoints)
    if (
      loyaltyPoints !== undefined &&
      (!Number.isFinite(loyaltyPoints) || loyaltyPoints < 0 || !Number.isInteger(loyaltyPoints))
    ) {
      setCreateError('Loyalty points must be a non-negative integer.')
      pushToast('error', 'Loyalty points must be a non-negative integer.')
      return
    }

    setCreateSubmitting(true)
    try {
      await createCustomer({
        code: createForm.code.trim() || undefined,
        name: createForm.name.trim(),
        contactPerson: createForm.contactPerson.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
        email: createForm.email.trim() || undefined,
        address: createForm.address.trim() || undefined,
        city: createForm.city.trim() || undefined,
        country: createForm.country.trim() || undefined,
        taxId: createForm.taxId.trim() || undefined,
        customerType: createForm.customerType === '' ? undefined : createForm.customerType,
        creditLimit,
        loyaltyPoints,
        customerGroupId: createForm.customerGroupId || undefined,
        notes: createForm.notes.trim() || undefined,
        dateOfBirth: createForm.dateOfBirth || undefined,
        gender: createForm.gender.trim() || undefined,
      })
      setCreateOpen(false)
      setStatusFilter('active')
      setPage(0)
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Customer created successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create customer'
      setCreateError(message)
      pushToast('error', message)
    } finally {
      setCreateSubmitting(false)
    }
  }

  const openEdit = (customer: CustomerResponse) => {
    setEditCustomerId(customer.id)
    setEditForm(customerFromResponse(customer))
    setEditError(null)
    setEditOpen(true)
  }

  const closeEdit = () => {
    if (editSubmitting) return
    setEditOpen(false)
    setEditCustomerId(null)
    setEditError(null)
  }

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEditError(null)
    if (!editCustomerId) return

    if (!editForm.name.trim()) {
      setEditError('Customer name is required.')
      pushToast('error', 'Customer name is required.')
      return
    }
    const creditLimit =
      editForm.creditLimit.trim() === '' ? undefined : Number(editForm.creditLimit)
    if (creditLimit !== undefined && (!Number.isFinite(creditLimit) || creditLimit < 0)) {
      setEditError('Credit limit must be a non-negative number.')
      pushToast('error', 'Credit limit must be a non-negative number.')
      return
    }
    const loyaltyPoints =
      editForm.loyaltyPoints.trim() === '' ? undefined : Number(editForm.loyaltyPoints)
    if (
      loyaltyPoints !== undefined &&
      (!Number.isFinite(loyaltyPoints) || loyaltyPoints < 0 || !Number.isInteger(loyaltyPoints))
    ) {
      setEditError('Loyalty points must be a non-negative integer.')
      pushToast('error', 'Loyalty points must be a non-negative integer.')
      return
    }

    setEditSubmitting(true)
    try {
      await updateCustomer(editCustomerId, {
        name: editForm.name.trim(),
        contactPerson: editForm.contactPerson.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        email: editForm.email.trim() || undefined,
        address: editForm.address.trim() || undefined,
        city: editForm.city.trim() || undefined,
        country: editForm.country.trim() || undefined,
        taxId: editForm.taxId.trim() || undefined,
        customerType: editForm.customerType === '' ? undefined : editForm.customerType,
        creditLimit,
        loyaltyPoints,
        customerGroupId: editForm.customerGroupId || undefined,
        isActive: editForm.isActive,
        notes: editForm.notes.trim() || undefined,
        dateOfBirth: editForm.dateOfBirth || undefined,
        gender: editForm.gender.trim() || undefined,
      })
      setEditOpen(false)
      setEditCustomerId(null)
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Customer updated successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update customer'
      setEditError(message)
      pushToast('error', message)
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDeactivate = (customer: CustomerResponse) => {
    if (!customer.isActive) return
    setConfirmState({
      title: 'Deactivate customer',
      message: `Deactivate customer "${customer.name}"?`,
      confirmLabel: 'Deactivate',
      destructive: true,
      onConfirm: async () => {
        try {
          await deactivateCustomer(customer.id)
          setRefreshKey((value) => value + 1)
          pushToast('success', `Customer "${customer.name}" deactivated.`)
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to deactivate customer')
        }
        setConfirmState(null)
      },
    })
  }

  const openDetail = async (customer: CustomerResponse) => {
    setDetailCustomer(customer)
    setLoyaltyDelta('')
    setBalanceDelta('')
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const fresh = await fetchCustomer(customer.id)
      setDetailCustomer(fresh)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to load customer details')
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    if (loyaltySubmitting || balanceSubmitting) return
    setDetailOpen(false)
    setDetailCustomer(null)
  }

  const submitLoyalty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detailCustomer) return
    const delta = Number(loyaltyDelta)
    if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
      pushToast('error', 'Loyalty adjustment must be a non-zero integer.')
      return
    }
    setLoyaltySubmitting(true)
    try {
      const updated = await adjustLoyaltyPoints(detailCustomer.id, delta)
      setDetailCustomer(updated)
      setLoyaltyDelta('')
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Loyalty points adjusted.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to adjust loyalty points')
    } finally {
      setLoyaltySubmitting(false)
    }
  }

  const submitBalance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detailCustomer) return
    const delta = Number(balanceDelta)
    if (!Number.isFinite(delta) || delta === 0) {
      pushToast('error', 'Balance adjustment must be a non-zero number.')
      return
    }
    setBalanceSubmitting(true)
    try {
      const updated = await adjustCustomerBalance(detailCustomer.id, delta)
      setDetailCustomer(updated)
      setBalanceDelta('')
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Customer balance adjusted.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to adjust balance')
    } finally {
      setBalanceSubmitting(false)
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">CRM</p>
          <h2 className="font-display text-xl text-slate-900">Customers</h2>
          <p className="text-sm text-slate-500">
            Total: {totalElements} | Groups: {groups.length}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <a
            href="/app/customer-groups"
            className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Manage Groups
          </a>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Add Customer
          </button>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-5">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(0)
            }}
            placeholder="Search by name, phone, email, code"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-emerald-400 focus:ring"
          />
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as StatusFilter)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
          <select
            value={groupFilter}
            onChange={(event) => {
              setGroupFilter(event.target.value)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">All groups</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="updatedAt">Updated At</option>
            <option value="name">Name</option>
            <option value="loyaltyPoints">Loyalty</option>
            <option value="currentBalance">Balance</option>
            <option value="createdAt">Created At</option>
          </select>
          <select
            value={sortDir}
            onChange={(event) => {
              setSortDir(event.target.value as 'asc' | 'desc')
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading customers...</p> : null}
      {!loading && error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Code</th>
                  <th className="px-2 py-2 font-medium">Phone</th>
                  <th className="px-2 py-2 font-medium">Email</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 font-medium">Group</th>
                  <th className="px-2 py-2 text-right font-medium">Loyalty</th>
                  <th className="px-2 py-2 text-right font-medium">Balance</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id} className="border-b border-slate-100">
                    <td className="px-2 py-3 font-medium text-slate-800">
                      <button
                        type="button"
                        onClick={() => openDetail(customer)}
                        className="text-left text-emerald-700 hover:underline"
                      >
                        {customer.name}
                      </button>
                    </td>
                    <td className="px-2 py-3 text-slate-600">{customer.code || '-'}</td>
                    <td className="px-2 py-3 text-slate-600">{customer.phone || '-'}</td>
                    <td className="px-2 py-3 text-slate-600">{customer.email || '-'}</td>
                    <td className="px-2 py-3 text-slate-600">{customer.customerType ?? '-'}</td>
                    <td className="px-2 py-3 text-slate-600">{groupName(customer.customerGroupId)}</td>
                    <td className="px-2 py-3 text-right font-mono text-slate-800">
                      {customer.loyaltyPoints ?? 0}
                    </td>
                    <td className="px-2 py-3 text-right font-mono text-slate-800">
                      {formatCurrency(customer.currentBalance ?? 0)}
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          customer.isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {customer.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(customer)}
                          className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                          Edit
                        </button>
                        <Link
                          to={`/app/accounting/receivables?customerId=${customer.id}`}
                          className="rounded-lg border border-sky-200 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                        >
                          Receivables
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeactivate(customer)}
                          disabled={!customer.isActive}
                          className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-2 py-6 text-center text-sm text-slate-500">
                      No customers found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-slate-600">
              Total: {totalElements} | Page {totalPages === 0 ? 0 : page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <select
                value={size}
                onChange={(event) => {
                  setSize(Number(event.target.value))
                  setPage(0)
                }}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
              </select>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                disabled={page === 0}
                className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => (prev + 1 < totalPages ? prev + 1 : prev))}
                disabled={page + 1 >= totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <Modal title="Create Customer" onClose={closeCreate} maxWidthClass="max-w-3xl">
          <CustomerFormFields
            form={createForm}
            setForm={setCreateForm}
            groups={activeGroups}
            showActive={false}
          />
          <form onSubmit={submitCreate} className="mt-3 space-y-3">
            {createError ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{createError}</p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeCreate}
                disabled={createSubmitting}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createSubmitting}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {createSubmitting ? 'Creating...' : 'Create Customer'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editOpen ? (
        <Modal title="Edit Customer" onClose={closeEdit} maxWidthClass="max-w-3xl">
          <CustomerFormFields
            form={editForm}
            setForm={setEditForm}
            groups={activeGroups}
            showActive
          />
          <form onSubmit={submitEdit} className="mt-3 space-y-3">
            {editError ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{editError}</p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeEdit}
                disabled={editSubmitting}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSubmitting}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {editSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {confirmState ? (
        <ConfirmModal
          {...confirmState}
          onClose={() => setConfirmState(null)}
        />
      ) : null}

      {detailOpen && detailCustomer ? (
        <Modal
          title={`Customer — ${detailCustomer.name}`}
          onClose={closeDetail}
          maxWidthClass="max-w-3xl"
        >
          {detailLoading ? (
            <p className="text-sm text-slate-500">Loading details...</p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <DetailField label="Code" value={detailCustomer.code} />
            <DetailField label="Type" value={detailCustomer.customerType} />
            <DetailField label="Phone" value={detailCustomer.phone} />
            <DetailField label="Email" value={detailCustomer.email} />
            <DetailField label="Contact Person" value={detailCustomer.contactPerson} />
            <DetailField label="Tax ID" value={detailCustomer.taxId} />
            <DetailField label="Group" value={groupName(detailCustomer.customerGroupId)} />
            <DetailField
              label="Status"
              value={detailCustomer.isActive ? 'Active' : 'Inactive'}
            />
            <DetailField label="City" value={detailCustomer.city} />
            <DetailField label="Country" value={detailCustomer.country} />
            <DetailField label="Date of Birth" value={detailCustomer.dateOfBirth} />
            <DetailField label="Gender" value={detailCustomer.gender} />
            <DetailField
              label="Credit Limit"
              value={formatCurrency(detailCustomer.creditLimit ?? 0)}
            />
            <DetailField
              label="Current Balance"
              value={formatCurrency(detailCustomer.currentBalance ?? 0)}
            />
            <DetailField label="Loyalty Points" value={String(detailCustomer.loyaltyPoints ?? 0)} />
            <DetailField label="Address" value={detailCustomer.address} />
            <DetailField label="Notes" value={detailCustomer.notes} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <form
              onSubmit={submitLoyalty}
              className="rounded-xl border border-slate-200 p-3"
            >
              <p className="mb-2 text-sm font-semibold text-slate-800">Adjust Loyalty Points</p>
              <p className="mb-2 text-xs text-slate-500">
                Current: {detailCustomer.loyaltyPoints ?? 0}. Use negative to deduct.
              </p>
              <div className="flex gap-2">
                <input
                  value={loyaltyDelta}
                  onChange={(event) => setLoyaltyDelta(event.target.value)}
                  type="number"
                  step="1"
                  placeholder="Delta"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={loyaltySubmitting}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {loyaltySubmitting ? 'Saving...' : 'Apply'}
                </button>
              </div>
            </form>

            <form onSubmit={submitBalance} className="rounded-xl border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-800">Adjust Balance</p>
              <p className="mb-2 text-xs text-slate-500">
                Current: {formatCurrency(detailCustomer.currentBalance ?? 0)}. Use negative to
                reduce.
              </p>
              <div className="flex gap-2">
                <input
                  value={balanceDelta}
                  onChange={(event) => setBalanceDelta(event.target.value)}
                  type="number"
                  step="0.01"
                  placeholder="Delta"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={balanceSubmitting}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {balanceSubmitting ? 'Saving...' : 'Apply'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}

type CustomerFormFieldsProps = {
  form: CustomerFormState
  setForm: Dispatch<SetStateAction<CustomerFormState>>
  groups: CustomerGroupResponse[]
  showActive: boolean
}

function CustomerFormFields({ form, setForm, groups, showActive }: CustomerFormFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <input
        value={form.name}
        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
        placeholder="Name *"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        value={form.code}
        onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
        placeholder="Code"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        value={form.phone}
        onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
        placeholder="Phone"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        value={form.email}
        onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
        type="email"
        placeholder="Email"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        value={form.contactPerson}
        onChange={(event) => setForm((prev) => ({ ...prev, contactPerson: event.target.value }))}
        placeholder="Contact person"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <select
        value={form.customerType}
        onChange={(event) =>
          setForm((prev) => ({ ...prev, customerType: event.target.value as CustomerType | '' }))
        }
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      >
        <option value="">Type (optional)</option>
        <option value="INDIVIDUAL">Individual</option>
        <option value="COMPANY">Company</option>
      </select>
      <select
        value={form.customerGroupId}
        onChange={(event) => setForm((prev) => ({ ...prev, customerGroupId: event.target.value }))}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      >
        <option value="">No group</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
      <input
        value={form.taxId}
        onChange={(event) => setForm((prev) => ({ ...prev, taxId: event.target.value }))}
        placeholder="Tax ID"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        value={form.address}
        onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
        placeholder="Address"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
      />
      <input
        value={form.city}
        onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
        placeholder="City"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        value={form.country}
        onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
        placeholder="Country"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        value={form.creditLimit}
        onChange={(event) => setForm((prev) => ({ ...prev, creditLimit: event.target.value }))}
        type="number"
        step="0.01"
        min="0"
        placeholder="Credit limit"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        value={form.loyaltyPoints}
        onChange={(event) => setForm((prev) => ({ ...prev, loyaltyPoints: event.target.value }))}
        type="number"
        step="1"
        min="0"
        placeholder="Loyalty points"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        value={form.dateOfBirth}
        onChange={(event) => setForm((prev) => ({ ...prev, dateOfBirth: event.target.value }))}
        type="date"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        value={form.gender}
        onChange={(event) => setForm((prev) => ({ ...prev, gender: event.target.value }))}
        placeholder="Gender"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <textarea
        value={form.notes}
        onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
        placeholder="Notes"
        rows={2}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
      />
      {showActive ? (
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 md:col-span-2">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
          />
          Active
        </label>
      ) : null}
    </div>
  )
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value || '-'}</p>
    </div>
  )
}
