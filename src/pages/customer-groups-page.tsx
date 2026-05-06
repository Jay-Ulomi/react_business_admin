import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  createCustomerGroup,
  deactivateCustomerGroup,
  fetchCustomerGroups,
  updateCustomerGroup,
  type CustomerGroupResponse,
} from '../features/customers/customer-groups-api'
import { Modal } from '../features/ui/modal'
import { ConfirmModal, type ConfirmState } from '../features/ui/confirm-modal'
import { useToast } from '../features/ui/toast-context'

type GroupFormState = {
  name: string
  description: string
  discountPercentage: string
  isActive: boolean
}

const emptyGroupForm: GroupFormState = {
  name: '',
  description: '',
  discountPercentage: '',
  isActive: true,
}

function groupFormFromResponse(group: CustomerGroupResponse): GroupFormState {
  return {
    name: group.name ?? '',
    description: group.description ?? '',
    discountPercentage:
      group.discountPercentage == null ? '' : String(group.discountPercentage),
    isActive: group.isActive,
  }
}

export function CustomerGroupsPage() {
  const { pushToast } = useToast()
  const [groups, setGroups] = useState<CustomerGroupResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<GroupFormState>(emptyGroupForm)

  const [editOpen, setEditOpen] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editGroupId, setEditGroupId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<GroupFormState>(emptyGroupForm)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const rows = await fetchCustomerGroups()
        if (!cancelled) setGroups(rows)
      } catch (err) {
        if (!cancelled) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to load customer groups')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [refreshKey, pushToast])

  const activeCount = useMemo(() => groups.filter((group) => group.isActive).length, [groups])

  const openCreate = () => {
    setCreateForm(emptyGroupForm)
    setCreateError(null)
    setCreateOpen(true)
  }

  const closeCreate = () => {
    if (createSubmitting) return
    setCreateOpen(false)
    setCreateError(null)
  }

  const parseDiscount = (value: string): number | undefined => {
    if (value.trim() === '') return undefined
    return Number(value)
  }

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateError(null)
    if (!createForm.name.trim()) {
      setCreateError('Group name is required.')
      pushToast('error', 'Group name is required.')
      return
    }
    const discount = parseDiscount(createForm.discountPercentage)
    if (
      discount !== undefined &&
      (!Number.isFinite(discount) || discount < 0 || discount > 100)
    ) {
      setCreateError('Discount must be between 0 and 100.')
      pushToast('error', 'Discount must be between 0 and 100.')
      return
    }

    setCreateSubmitting(true)
    try {
      await createCustomerGroup({
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        discountPercentage: discount,
      })
      setCreateOpen(false)
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Customer group created.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create customer group'
      setCreateError(message)
      pushToast('error', message)
    } finally {
      setCreateSubmitting(false)
    }
  }

  const openEdit = (group: CustomerGroupResponse) => {
    setEditGroupId(group.id)
    setEditForm(groupFormFromResponse(group))
    setEditError(null)
    setEditOpen(true)
  }

  const closeEdit = () => {
    if (editSubmitting) return
    setEditOpen(false)
    setEditGroupId(null)
    setEditError(null)
  }

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEditError(null)
    if (!editGroupId) return
    if (!editForm.name.trim()) {
      setEditError('Group name is required.')
      pushToast('error', 'Group name is required.')
      return
    }
    const discount = parseDiscount(editForm.discountPercentage)
    if (
      discount !== undefined &&
      (!Number.isFinite(discount) || discount < 0 || discount > 100)
    ) {
      setEditError('Discount must be between 0 and 100.')
      pushToast('error', 'Discount must be between 0 and 100.')
      return
    }

    setEditSubmitting(true)
    try {
      await updateCustomerGroup(editGroupId, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        discountPercentage: discount,
        isActive: editForm.isActive,
      })
      setEditOpen(false)
      setEditGroupId(null)
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Customer group updated.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update customer group'
      setEditError(message)
      pushToast('error', message)
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDeactivate = (group: CustomerGroupResponse) => {
    if (!group.isActive) return
    setConfirmState({
      title: 'Deactivate group',
      message: `Deactivate group "${group.name}"?`,
      confirmLabel: 'Deactivate',
      destructive: true,
      onConfirm: async () => {
        try {
          await deactivateCustomerGroup(group.id)
          setRefreshKey((value) => value + 1)
          pushToast('success', `Group "${group.name}" deactivated.`)
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to deactivate group')
        }
        setConfirmState(null)
      },
    })
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">CRM</p>
          <h2 className="font-display text-xl text-slate-900">Customer Groups</h2>
          <p className="text-sm text-slate-500">
            Total: {groups.length} | Active: {activeCount}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Add Group
        </button>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading customer groups...</p> : null}

      {!loading ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-2 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Description</th>
                <th className="px-2 py-2 text-right font-medium">Discount %</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id} className="border-b border-slate-100">
                  <td className="px-2 py-3 font-medium text-slate-800">{group.name}</td>
                  <td className="px-2 py-3 text-slate-600">{group.description || '-'}</td>
                  <td className="px-2 py-3 text-right font-mono text-slate-800">
                    {group.discountPercentage == null ? '-' : Number(group.discountPercentage).toFixed(2)}
                  </td>
                  <td className="px-2 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        group.isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {group.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(group)}
                        className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeactivate(group)}
                        disabled={!group.isActive}
                        className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        Deactivate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-sm text-slate-500">
                    No customer groups yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {createOpen ? (
        <Modal title="Create Customer Group" onClose={closeCreate}>
          <form className="space-y-3" onSubmit={submitCreate}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Group name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
              <input
                value={createForm.discountPercentage}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, discountPercentage: event.target.value }))
                }
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="Discount %"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <textarea
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Description"
                rows={2}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
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
                {createSubmitting ? 'Creating...' : 'Create Group'}
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

      {editOpen ? (
        <Modal title="Edit Customer Group" onClose={closeEdit}>
          <form className="space-y-3" onSubmit={submitEdit}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={editForm.name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Group name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
              <input
                value={editForm.discountPercentage}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, discountPercentage: event.target.value }))
                }
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="Discount %"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, isActive: event.target.checked }))
                  }
                />
                Active
              </label>
              <textarea
                value={editForm.description}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Description"
                rows={2}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
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
    </section>
  )
}
