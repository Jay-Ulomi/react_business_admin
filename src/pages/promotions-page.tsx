import { type FormEvent, useEffect, useState } from 'react'
import {
  createPromotion,
  deactivatePromotion,
  fetchPromotions,
  updatePromotion,
  type DiscountType,
  type PromotionRequest,
  type PromotionResponse,
  type PromotionScope,
} from '../features/promotions/promotions-api'
import { Modal } from '../features/ui/modal'
import { ConfirmModal, type ConfirmState } from '../features/ui/confirm-modal'
import { useToast } from '../features/ui/toast-context'
import { formatCurrency } from '../lib/format'

const EMPTY_FORM: PromotionRequest = {
  name: '',
  description: '',
  discountType: 'PERCENTAGE',
  discountValue: 10,
  scope: 'CART',
  minimumOrderAmount: undefined,
  productIds: [],
  categoryIds: [],
  startDate: '',
  endDate: '',
  usageLimit: undefined,
  couponCode: '',
}

function scopeLabel(scope: PromotionScope): string {
  return scope === 'CART' ? 'Entire Cart' : scope === 'PRODUCT' ? 'Specific Products' : 'Category'
}

function discountLabel(p: PromotionResponse): string {
  return p.discountType === 'PERCENTAGE'
    ? `${p.discountValue}% off`
    : `${formatCurrency(p.discountValue)} off`
}

export function PromotionsPage() {
  const { pushToast } = useToast()
  const [promotions, setPromotions] = useState<PromotionResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<PromotionRequest>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const resp = await fetchPromotions(page)
        if (!cancelled) {
          setPromotions(resp.content)
          setTotalPages(resp.totalPages)
        }
      } catch (err) {
        if (!cancelled) pushToast('error', err instanceof Error ? err.message : 'Failed to load promotions')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [page, refreshKey])

  const openCreate = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (p: PromotionResponse) => {
    setEditId(p.id)
    setForm({
      name: p.name,
      description: p.description ?? '',
      discountType: p.discountType,
      discountValue: p.discountValue,
      scope: p.scope,
      minimumOrderAmount: p.minimumOrderAmount,
      productIds: p.productIds ?? [],
      categoryIds: p.categoryIds ?? [],
      startDate: p.startDate ?? '',
      endDate: p.endDate ?? '',
      usageLimit: p.usageLimit,
      couponCode: p.couponCode ?? '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setFormError('Name is required.'); return }
    if (!form.discountValue || form.discountValue <= 0) { setFormError('Discount value must be > 0.'); return }
    setSubmitting(true)
    setFormError(null)
    try {
      const payload: PromotionRequest = {
        ...form,
        name: form.name.trim(),
        couponCode: form.couponCode?.trim() || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        description: form.description || undefined,
      }
      if (editId) {
        await updatePromotion(editId, payload)
        pushToast('success', 'Promotion updated.')
      } else {
        await createPromotion(payload)
        pushToast('success', 'Promotion created.')
      }
      setModalOpen(false)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save promotion')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeactivate = (p: PromotionResponse) => {
    setConfirmState({
      title: 'Deactivate Promotion',
      message: `Deactivate "${p.name}"? It will no longer apply to sales.`,
      confirmLabel: 'Deactivate',
      destructive: true,
      onConfirm: async () => {
        try {
          await deactivatePromotion(p.id)
          pushToast('success', 'Promotion deactivated.')
          setRefreshKey((k) => k + 1)
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to deactivate')
        }
        setConfirmState(null)
      },
    })
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Marketing</p>
          <h2 className="font-display text-xl text-slate-900">Promotions & Coupons</h2>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          New Promotion
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading promotions...</p>
      ) : promotions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center">
          <p className="text-sm text-slate-500">No promotions yet.</p>
          <p className="mt-1 text-xs text-slate-400">Create percentage discounts, fixed-amount offers, or coupon codes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {promotions.map((p) => (
            <div
              key={p.id}
              className={`rounded-xl border px-4 py-3 ${p.isActive ? 'border-emerald-100 bg-emerald-50' : 'border-slate-200 bg-slate-50 opacity-60'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{p.name}</p>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                      {discountLabel(p)}
                    </span>
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                      {scopeLabel(p.scope)}
                    </span>
                    {p.couponCode && (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-xs text-amber-800">
                        {p.couponCode}
                      </span>
                    )}
                    {!p.isActive && (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">Inactive</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {p.startDate || p.endDate ? `${p.startDate ?? '∞'} → ${p.endDate ?? '∞'}` : 'Always active'}
                    {p.minimumOrderAmount ? ` · Min order: ${formatCurrency(p.minimumOrderAmount)}` : ''}
                    {p.usageLimit ? ` · Used ${p.usageCount}/${p.usageLimit}` : p.usageCount > 0 ? ` · Used ${p.usageCount}×` : ''}
                  </p>
                  {p.description && <p className="mt-0.5 text-xs text-slate-400">{p.description}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    Edit
                  </button>
                  {p.isActive && (
                    <button
                      type="button"
                      onClick={() => handleDeactivate(p)}
                      className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 pt-2 text-sm">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-slate-500">Page {page + 1} / {totalPages}</span>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <Modal title={editId ? 'Edit Promotion' : 'New Promotion'} onClose={() => setModalOpen(false)}>
          <form className="space-y-3" onSubmit={(e) => void handleSubmit(e)}>
            <input
              placeholder="Promotion name *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Discount Type</label>
                <select
                  aria-label="Discount type"
                  value={form.discountType}
                  onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value as DiscountType }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="PERCENTAGE">Percentage (%)</option>
                  <option value="FIXED_AMOUNT">Fixed Amount</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">
                  {form.discountType === 'PERCENTAGE' ? 'Percentage (e.g. 10)' : 'Amount'}
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.discountValue}
                  onChange={(e) => setForm((f) => ({ ...f, discountValue: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Applies To</label>
                <select
                  aria-label="Promotion scope"
                  value={form.scope}
                  onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as PromotionScope }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="CART">Entire Cart</option>
                  <option value="PRODUCT">Specific Products</option>
                  <option value="CATEGORY">Category</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Min. Order Amount</label>
                <input
                  type="number"
                  min="0"
                  placeholder="No minimum"
                  value={form.minimumOrderAmount ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, minimumOrderAmount: e.target.value ? Number(e.target.value) : undefined }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Start Date</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">End Date</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Coupon Code (blank = auto-apply)</label>
                <input
                  placeholder="e.g. SAVE10"
                  value={form.couponCode}
                  onChange={(e) => setForm((f) => ({ ...f, couponCode: e.target.value.toUpperCase() }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Usage Limit (blank = unlimited)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={form.usageLimit ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value ? Number(e.target.value) : undefined }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            {formError && <p className="text-xs text-rose-600">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting ? 'Saving...' : editId ? 'Save Changes' : 'Create Promotion'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmState && <ConfirmModal {...confirmState} onClose={() => setConfirmState(null)} />}
    </section>
  )
}
