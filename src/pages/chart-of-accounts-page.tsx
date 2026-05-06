import { type FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  createAccount,
  deactivateAccount,
  fetchAccountGroups,
  fetchAccounts,
  seedDefaultAccounts,
  updateAccount,
  type AccountGroupResponse,
  type AccountResponse,
  type AccountType,
} from '../features/accounting/chart-of-accounts-api'
import { Modal } from '../features/ui/modal'
import { ConfirmModal, type ConfirmState } from '../features/ui/confirm-modal'
import { useToast } from '../features/ui/toast-context'
import { formatCurrency } from '../lib/format'

const ACCOUNT_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']

export function ChartOfAccountsPage() {
  const { pushToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [accounts, setAccounts] = useState<AccountResponse[]>([])
  const [groups, setGroups] = useState<AccountGroupResponse[]>([])
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [typeFilter, setTypeFilter] = useState<AccountType | 'ALL'>(
    (searchParams.get('type') as AccountType | 'ALL' | null) ?? 'ALL',
  )
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(
    (searchParams.get('status') as 'all' | 'active' | 'inactive' | null) ?? 'active',
  )
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '0') || 0)
  const [size, setSize] = useState(Number(searchParams.get('size') ?? '50') || 50)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createForm, setCreateForm] = useState({
    code: '',
    name: '',
    accountType: 'ASSET' as AccountType,
    accountGroupId: '',
    description: '',
  })

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    accountType: 'ASSET' as AccountType,
    accountGroupId: '',
    description: '',
    isActive: true,
  })

  useEffect(() => {
    const next = new URLSearchParams()
    if (search) next.set('search', search)
    if (typeFilter !== 'ALL') next.set('type', typeFilter)
    if (statusFilter !== 'active') next.set('status', statusFilter)
    if (page !== 0) next.set('page', String(page))
    if (size !== 50) next.set('size', String(size))
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [search, typeFilter, statusFilter, page, size, searchParams, setSearchParams])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const isActive =
          statusFilter === 'all' ? undefined : statusFilter === 'active' ? true : false
        const [accountsPage, groupList] = await Promise.all([
          fetchAccounts({
            search: search || undefined,
            accountType: typeFilter === 'ALL' ? undefined : typeFilter,
            isActive,
            page,
            size,
          }),
          fetchAccountGroups().catch(() => [] as AccountGroupResponse[]),
        ])
        if (cancelled) return
        setAccounts(accountsPage.content)
        setTotalPages(accountsPage.totalPages)
        setTotalElements(accountsPage.totalElements)
        setGroups(groupList)
      } catch (err) {
        if (!cancelled) pushToast('error', err instanceof Error ? err.message : 'Failed to load accounts')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [search, typeFilter, statusFilter, page, size, refreshKey, pushToast])

  const openEditModal = (account: AccountResponse) => {
    setEditId(account.id)
    setEditForm({
      name: account.name,
      accountType: account.accountType,
      accountGroupId: account.accountGroupId ?? '',
      description: account.description ?? '',
      isActive: account.isActive,
    })
    setEditModalOpen(true)
  }

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!createForm.code.trim() || !createForm.name.trim()) {
      pushToast('error', 'Account code and name are required.')
      return
    }
    setCreateSubmitting(true)
    try {
      await createAccount({
        code: createForm.code.trim(),
        name: createForm.name.trim(),
        accountType: createForm.accountType,
        accountGroupId: createForm.accountGroupId || undefined,
        description: createForm.description.trim() || undefined,
      })
      setCreateModalOpen(false)
      setCreateForm({
        code: '',
        name: '',
        accountType: 'ASSET',
        accountGroupId: '',
        description: '',
      })
      setRefreshKey((v) => v + 1)
      pushToast('success', 'Account created successfully.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setCreateSubmitting(false)
    }
  }

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editId) return
    if (!editForm.name.trim()) {
      pushToast('error', 'Account name is required.')
      return
    }
    setEditSubmitting(true)
    try {
      await updateAccount(editId, {
        name: editForm.name.trim(),
        accountType: editForm.accountType,
        accountGroupId: editForm.accountGroupId || undefined,
        description: editForm.description.trim() || undefined,
        isActive: editForm.isActive,
      })
      setEditModalOpen(false)
      setEditId(null)
      setRefreshKey((v) => v + 1)
      pushToast('success', 'Account updated successfully.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to update account')
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleArchive = (account: AccountResponse) => {
    if (!account.isActive) return
    setConfirmState({
      title: 'Archive account',
      message: `Archive account "${account.code} ${account.name}"?`,
      confirmLabel: 'Archive',
      destructive: true,
      onConfirm: async () => {
        try {
          await deactivateAccount(account.id)
          setRefreshKey((v) => v + 1)
          pushToast('success', 'Account archived.')
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to archive account')
        }
        setConfirmState(null)
      },
    })
  }

  const handleSeed = () => {
    setConfirmState({
      title: 'Seed chart of accounts',
      message: 'Seed default chart of accounts for this business?',
      confirmLabel: 'Seed',
      destructive: false,
      onConfirm: async () => {
        try {
          await seedDefaultAccounts()
          setRefreshKey((v) => v + 1)
          pushToast('success', 'Default chart of accounts seeded.')
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to seed defaults')
        }
        setConfirmState(null)
      },
    })
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Accounting</p>
          <h2 className="font-display text-xl text-slate-900">Chart of Accounts</h2>
          <p className="text-sm text-slate-500">Total: {totalElements} accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSeed}
            className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Seed Defaults
          </button>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Add Account
          </button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-4">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(0)
          }}
          placeholder="Search code or name"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <select
          value={typeFilter}
          onChange={(event) => {
            setTypeFilter(event.target.value as AccountType | 'ALL')
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="ALL">All types</option>
          {ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as 'all' | 'active' | 'inactive')
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <select
          value={size}
          onChange={(event) => {
            setSize(Number(event.target.value))
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value={25}>25 rows</option>
          <option value={50}>50 rows</option>
          <option value={100}>100 rows</option>
        </select>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading accounts...</p> : null}

      {!loading ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Code</th>
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 font-medium">Group</th>
                  <th className="px-2 py-2 text-right font-medium">Balance</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => {
                  const balance = Number(account.currentBalance ?? 0)
                  const negative = balance < 0
                  return (
                    <tr key={account.id} className="border-b border-slate-100">
                      <td className="px-2 py-3 font-mono text-slate-700">{account.code}</td>
                      <td className="px-2 py-3 font-medium text-slate-800">{account.name}</td>
                      <td className="px-2 py-3 text-slate-700">{account.accountType}</td>
                      <td className="px-2 py-3 text-slate-600">{account.accountGroupName ?? '-'}</td>
                      <td
                        className={`px-2 py-3 text-right font-mono ${
                          negative ? 'text-rose-600' : 'text-slate-800'
                        }`}
                      >
                        {negative ? `(${formatCurrency(Math.abs(balance))})` : formatCurrency(balance)}
                      </td>
                      <td className="px-2 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            account.isActive
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {account.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(account)}
                            className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleArchive(account)}
                            disabled={!account.isActive || account.isSystemAccount}
                            className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                          >
                            Archive
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-6 text-center text-sm text-slate-500">
                      No accounts found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <p className="text-slate-600">
              Page {totalPages === 0 ? 0 : page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                disabled={page + 1 >= totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmState ? (
        <ConfirmModal
          {...confirmState}
          onClose={() => setConfirmState(null)}
        />
      ) : null}

      {createModalOpen ? (
        <Modal title="Create Account" onClose={() => !createSubmitting && setCreateModalOpen(false)}>
          <form className="space-y-3" onSubmit={submitCreate}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={createForm.code}
                onChange={(event) => setCreateForm((p) => ({ ...p, code: event.target.value }))}
                placeholder="Account code *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={createForm.name}
                onChange={(event) => setCreateForm((p) => ({ ...p, name: event.target.value }))}
                placeholder="Account name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={createForm.accountType}
                onChange={(event) =>
                  setCreateForm((p) => ({ ...p, accountType: event.target.value as AccountType }))
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                value={createForm.accountGroupId}
                onChange={(event) =>
                  setCreateForm((p) => ({ ...p, accountGroupId: event.target.value }))
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">No group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.type})
                  </option>
                ))}
              </select>
              <textarea
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((p) => ({ ...p, description: event.target.value }))
                }
                placeholder="Description"
                rows={3}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
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
                {createSubmitting ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editModalOpen ? (
        <Modal title="Edit Account" onClose={() => !editSubmitting && setEditModalOpen(false)}>
          <form className="space-y-3" onSubmit={submitEdit}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={editForm.name}
                onChange={(event) => setEditForm((p) => ({ ...p, name: event.target.value }))}
                placeholder="Account name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={editForm.accountType}
                onChange={(event) =>
                  setEditForm((p) => ({ ...p, accountType: event.target.value as AccountType }))
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                value={editForm.accountGroupId}
                onChange={(event) =>
                  setEditForm((p) => ({ ...p, accountGroupId: event.target.value }))
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">No group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.type})
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(event) => setEditForm((p) => ({ ...p, isActive: event.target.checked }))}
                />
                Account active
              </label>
              <textarea
                value={editForm.description}
                onChange={(event) =>
                  setEditForm((p) => ({ ...p, description: event.target.value }))
                }
                placeholder="Description"
                rows={3}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
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
                {editSubmitting ? 'Saving...' : 'Save Account'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  )
}
