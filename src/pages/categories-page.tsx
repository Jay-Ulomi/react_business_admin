import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  createCategory,
  deactivateCategory,
  fetchCategories,
  updateCategory,
  type ProductCategory,
} from '../features/categories/categories-api'
import { ConfirmModal, type ConfirmState } from '../features/ui/confirm-modal'
import { Modal } from '../features/ui/modal'
import { useToast } from '../features/ui/toast-context'

function isCategoryEnabled(category: ProductCategory): boolean {
  return category.isActive ?? category.active ?? false
}

function mapCategoryDeactivateError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Failed to deactivate category'
  if (message.toLowerCase().includes('active products are using')) {
    return 'Cannot deactivate this category because active products are using it. Update those products first.'
  }
  return message
}

export function CategoriesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { pushToast } = useToast()
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [page, setPage] = useState(Math.max(0, Number(searchParams.get('page') ?? 0)))
  const [pageSize, setPageSize] = useState(() => {
    const parsed = Number(searchParams.get('size') ?? 10)
    return [10, 20, 50].includes(parsed) ? parsed : 0
  })

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    parentCategoryId: '',
    sortOrder: '0',
  })

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    parentCategoryId: '',
    sortOrder: '0',
    isActive: true,
  })

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const rows = await fetchCategories()
        if (!cancelled) setCategories(rows)
      } catch (err) {
        if (!cancelled) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to load categories')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [pushToast, refreshKey])

  const activeCount = useMemo(
    () => categories.filter((category) => isCategoryEnabled(category)).length,
    [categories],
  )

  const totalPages = Math.max(1, Math.ceil(categories.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const pagedCategories = useMemo(
    () => categories.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [categories, pageSize, safePage],
  )

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (page !== 0) next.set('page', String(page))
    else next.delete('page')
    if (pageSize !== 20) next.set('size', String(pageSize))
    else next.delete('size')
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [page, pageSize, searchParams, setSearchParams])

  const resetCreateForm = () => {
    setCreateForm({
      name: '',
      description: '',
      parentCategoryId: '',
      sortOrder: '0',
    })
    setCreateError(null)
  }

  const openCreateModal = () => {
    resetCreateForm()
    setCreateModalOpen(true)
  }

  const closeCreateModal = () => {
    if (createSubmitting) return
    setCreateModalOpen(false)
    setCreateError(null)
  }

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateError(null)
    if (!createForm.name.trim()) {
      setCreateError('Category name is required.')
      pushToast('error', 'Category name is required.')
      return
    }
    const sortOrder = Number(createForm.sortOrder)
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      setCreateError('Sort order must be a valid non-negative integer.')
      pushToast('error', 'Sort order must be a valid non-negative integer.')
      return
    }

    setCreateSubmitting(true)
    try {
      await createCategory({
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        parentCategoryId: createForm.parentCategoryId || undefined,
        sortOrder,
      })
      setCreateModalOpen(false)
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Category created successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create category'
      setCreateError(message)
      pushToast('error', message)
    } finally {
      setCreateSubmitting(false)
    }
  }

  const openEditModal = (category: ProductCategory) => {
    setEditCategoryId(category.id)
    setEditForm({
      name: category.name ?? '',
      description: category.description ?? '',
      parentCategoryId: category.parentCategoryId ?? '',
      sortOrder: String(category.sortOrder ?? 0),
      isActive: isCategoryEnabled(category),
    })
    setEditError(null)
    setEditModalOpen(true)
  }

  const closeEditModal = () => {
    if (editSubmitting) return
    setEditModalOpen(false)
    setEditCategoryId(null)
    setEditError(null)
  }

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEditError(null)
    if (!editCategoryId) return
    if (!editForm.name.trim()) {
      setEditError('Category name is required.')
      pushToast('error', 'Category name is required.')
      return
    }
    const sortOrder = Number(editForm.sortOrder)
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      setEditError('Sort order must be a valid non-negative integer.')
      pushToast('error', 'Sort order must be a valid non-negative integer.')
      return
    }

    setEditSubmitting(true)
    try {
      await updateCategory(editCategoryId, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        parentCategoryId: editForm.parentCategoryId || undefined,
        clearParentCategory: editForm.parentCategoryId ? undefined : true,
        sortOrder,
        isActive: editForm.isActive,
      })
      setEditModalOpen(false)
      setEditCategoryId(null)
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Category updated successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update category'
      setEditError(message)
      pushToast('error', message)
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDeactivate = (category: ProductCategory) => {
    if (!isCategoryEnabled(category)) return
    setConfirmState({
      title: 'Deactivate category',
      message: `Deactivate category "${category.name}"?`,
      confirmLabel: 'Deactivate',
      destructive: true,
      onConfirm: async () => {
        try {
          await deactivateCategory(category.id)
          setRefreshKey((value) => value + 1)
          pushToast('success', `Category "${category.name}" deactivated.`)
        } catch (err) {
          pushToast('error', mapCategoryDeactivateError(err))
        }
        setConfirmState(null)
      },
    })
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Catalog</p>
          <h2 className="font-display text-xl text-slate-900">Product Categories</h2>
          <p className="text-sm text-slate-500">
            Total: {categories.length} | Active: {activeCount}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Add Category
        </button>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading categories...</p> : null}

      {!loading ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Parent</th>
                  <th className="px-2 py-2 font-medium">Sort</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedCategories.map((category) => (
                  <tr key={category.id} className="border-b border-slate-100">
                    <td className="px-2 py-3 font-medium text-slate-800">{category.name}</td>
                    <td className="px-2 py-3 text-slate-600">{category.parentCategoryName || '-'}</td>
                    <td className="px-2 py-3 text-slate-600">{category.sortOrder}</td>
                    <td className="px-2 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          isCategoryEnabled(category) ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isCategoryEnabled(category) ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(category)}
                          className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeactivate(category)}
                          disabled={!isCategoryEnabled(category)}
                          className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!pagedCategories.length ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-slate-500">
                      No categories found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <p className="text-slate-600">
              Showing {pagedCategories.length} of {categories.length}
            </p>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(0)
                }}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
              >
                <option value={10}>10 rows</option>
                <option value={20}>20 rows</option>
                <option value={50}>50 rows</option>
              </select>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                disabled={safePage === 0}
                className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Prev
              </button>
              <span className="text-slate-600">
                Page {safePage + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((prev) => (prev + 1 < totalPages ? prev + 1 : prev))}
                disabled={safePage + 1 >= totalPages}
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
        <Modal title="Create Category" onClose={closeCreateModal}>
          <form className="space-y-3" onSubmit={submitCreate}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Category name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
              <select
                value={createForm.parentCategoryId}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, parentCategoryId: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">No parent</option>
                {categories
                  .filter((row) => isCategoryEnabled(row))
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
              <input
                value={createForm.sortOrder}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                type="number"
                min="0"
                step="1"
                placeholder="Sort order"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <textarea
                value={createForm.description}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
                placeholder="Description"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>

            {createError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{createError}</p> : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={createSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                disabled={createSubmitting}
              >
                {createSubmitting ? 'Creating...' : 'Create Category'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editModalOpen ? (
        <Modal title="Edit Category" onClose={closeEditModal}>
          <form className="space-y-3" onSubmit={submitEdit}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={editForm.name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Category name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
              <select
                value={editForm.parentCategoryId}
                onChange={(event) => setEditForm((prev) => ({ ...prev, parentCategoryId: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">No parent</option>
                {categories
                  .filter((row) => row.id !== editCategoryId)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
              <input
                value={editForm.sortOrder}
                onChange={(event) => setEditForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                type="number"
                min="0"
                step="1"
                placeholder="Sort order"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <label className="md:col-span-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
                Active
              </label>
              <textarea
                value={editForm.description}
                onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
                placeholder="Description"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>

            {editError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{editError}</p> : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={editSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                disabled={editSubmitting}
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
