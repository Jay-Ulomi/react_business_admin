import { type FormEvent, useEffect, useState } from 'react'
import { fetchProducts, type ProductResponse } from '../features/products/products-api'
import {
  fetchSerialLots,
  receiveSerialLots,
  type SerialLotResponse,
  type SerialLotStatus,
} from '../features/serial-lots/serial-lots-api'
import { Modal } from '../features/ui/modal'
import { useToast } from '../features/ui/toast-context'

const STATUS_COLORS: Record<SerialLotStatus, string> = {
  AVAILABLE: 'bg-emerald-100 text-emerald-800',
  SOLD: 'bg-slate-200 text-slate-600',
  EXPIRED: 'bg-rose-100 text-rose-700',
  RESERVED: 'bg-amber-100 text-amber-700',
}

export function SerialLotsPage() {
  const { pushToast } = useToast()

  // Product search / selection
  const [productSearch, setProductSearch] = useState('')
  const [products, setProducts] = useState<ProductResponse[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<ProductResponse | null>(null)

  // Serial/lot list
  const [entries, setEntries] = useState<SerialLotResponse[]>([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<SerialLotStatus | ''>('')
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)

  // Receive modal
  const [modalOpen, setModalOpen] = useState(false)
  const [receiveType, setReceiveType] = useState<'SERIAL' | 'LOT'>('SERIAL')
  const [codesText, setCodesText] = useState('')
  const [lotQuantity, setLotQuantity] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [receiveNotes, setReceiveNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Search products (debounced)
  useEffect(() => {
    if (productSearch.trim().length < 2) { setProducts([]); return }
    const t = setTimeout(async () => {
      setProductsLoading(true)
      try {
        const resp = await fetchProducts({ search: productSearch.trim(), isActive: true, page: 0, size: 20 })
        setProducts(resp.content)
      } catch { /* ignore */ } finally {
        setProductsLoading(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [productSearch])

  // Load serial/lot entries when a product is selected
  useEffect(() => {
    if (!selectedProduct) { setEntries([]); return }
    let cancelled = false
    const run = async () => {
      setEntriesLoading(true)
      try {
        const resp = await fetchSerialLots(
          selectedProduct.id,
          filterStatus || undefined,
          page,
        )
        if (!cancelled) {
          setEntries(resp.content)
          setTotalPages(resp.totalPages)
        }
      } catch (err) {
        if (!cancelled) pushToast('error', err instanceof Error ? err.message : 'Failed to load entries')
      } finally {
        if (!cancelled) setEntriesLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [selectedProduct, filterStatus, page, refreshKey])

  const selectProduct = (p: ProductResponse) => {
    setSelectedProduct(p)
    setProductSearch('')
    setProducts([])
    setPage(0)
  }

  const openReceive = () => {
    if (!selectedProduct) return
    setReceiveType(selectedProduct.trackingType === 'LOT' ? 'LOT' : 'SERIAL')
    setCodesText('')
    setLotQuantity('')
    setExpiryDate('')
    setReceiveNotes('')
    setFormError(null)
    setModalOpen(true)
  }

  const handleReceive = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedProduct) return
    const codes = codesText.split(/[\n,]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
    if (codes.length === 0) { setFormError('Enter at least one code.'); return }
    if (receiveType === 'LOT' && (!lotQuantity || Number(lotQuantity) <= 0)) {
      setFormError('Lot quantity must be > 0.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const result = await receiveSerialLots({
        productId: selectedProduct.id,
        trackingType: receiveType,
        codes,
        lotQuantity: receiveType === 'LOT' ? Number(lotQuantity) : undefined,
        expiryDate: expiryDate || undefined,
        notes: receiveNotes.trim() || undefined,
      })
      pushToast('success', `${result.length} ${receiveType === 'SERIAL' ? 'serial(s)' : 'lot(s)'} received.`)
      setModalOpen(false)
      setRefreshKey(k => k + 1)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to receive')
    } finally {
      setSubmitting(false)
    }
  }

  const canReceive = selectedProduct && selectedProduct.trackingType !== 'NONE'

  return (
    <section className="space-y-4">
      {/* Product selector */}
      <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Serial & Lot Tracking</p>
        <div className="relative">
          <input
            placeholder="Search product by name or SKU…"
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          {productsLoading && (
            <span className="absolute right-3 top-2.5 text-xs text-slate-400">Searching…</span>
          )}
          {products.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
              {products.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectProduct(p)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{p.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    p.trackingType === 'SERIAL' ? 'bg-sky-100 text-sky-700'
                    : p.trackingType === 'LOT' ? 'bg-violet-100 text-violet-700'
                    : 'bg-slate-100 text-slate-500'
                  }`}>
                    {p.trackingType ?? 'NONE'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedProduct && (
          <div className="mt-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{selectedProduct.name}</p>
              {selectedProduct.sku && <p className="text-xs text-slate-500">SKU: {selectedProduct.sku}</p>}
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              selectedProduct.trackingType === 'SERIAL' ? 'bg-sky-100 text-sky-700'
              : selectedProduct.trackingType === 'LOT' ? 'bg-violet-100 text-violet-700'
              : 'bg-slate-100 text-slate-500'
            }`}>
              {selectedProduct.trackingType ?? 'NONE'} tracking
            </span>
            <button
              type="button"
              onClick={() => setSelectedProduct(null)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Change
            </button>
          </div>
        )}
      </div>

      {/* Entries table */}
      {selectedProduct && (
        <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-base font-semibold text-slate-900">
              {selectedProduct.trackingType === 'LOT' ? 'Lot Batches' : 'Serial Numbers'}
            </h2>
            <select
              aria-label="Filter by status"
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value as SerialLotStatus | ''); setPage(0) }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="">All statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="SOLD">Sold</option>
              <option value="EXPIRED">Expired</option>
              <option value="RESERVED">Reserved</option>
            </select>
            {canReceive && (
              <button
                type="button"
                onClick={openReceive}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                + Receive
              </button>
            )}
            {!canReceive && (
              <p className="text-xs text-amber-600">
                Enable Serial or Lot tracking on this product to receive.
              </p>
            )}
          </div>

          {entriesLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center">
              <p className="text-sm text-slate-500">No entries found.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                      <th className="pb-2 pr-4">
                        {selectedProduct.trackingType === 'LOT' ? 'Lot Number' : 'Serial Number'}
                      </th>
                      <th className="pb-2 pr-4">Qty / Available</th>
                      {selectedProduct.trackingType === 'LOT' && <th className="pb-2 pr-4">Expiry</th>}
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2">Received</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {entries.map(e => (
                      <tr key={e.id}>
                        <td className="py-2 pr-4 font-mono font-semibold text-slate-800">
                          {e.serialNumber ?? e.lotNumber}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">
                          {selectedProduct.trackingType === 'LOT'
                            ? `${e.availableQty} / ${e.quantity}`
                            : '—'}
                        </td>
                        {selectedProduct.trackingType === 'LOT' && (
                          <td className="py-2 pr-4 text-slate-600">{e.expiryDate ?? '—'}</td>
                        )}
                        <td className="py-2 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[e.status]}`}>
                            {e.status}
                          </span>
                        </td>
                        <td className="py-2 text-xs text-slate-400">
                          {e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 pt-3 text-sm">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <span className="text-slate-500">Page {page + 1} / {totalPages}</span>
                  <button
                    type="button"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Receive modal */}
      {modalOpen && selectedProduct && (
        <Modal title="Receive Stock" onClose={() => setModalOpen(false)}>
          <form className="space-y-3" onSubmit={e => void handleReceive(e)}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Type</label>
                <select
                  aria-label="Tracking type"
                  value={receiveType}
                  onChange={e => setReceiveType(e.target.value as 'SERIAL' | 'LOT')}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="SERIAL">Serial Numbers</option>
                  <option value="LOT">Lot / Batch</option>
                </select>
              </div>
              {receiveType === 'LOT' && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Lot Quantity</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 100"
                    value={lotQuantity}
                    onChange={e => setLotQuantity(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">
                {receiveType === 'SERIAL'
                  ? 'Serial Numbers (one per line or comma-separated)'
                  : 'Lot Number'}
              </label>
              <textarea
                rows={receiveType === 'SERIAL' ? 5 : 2}
                placeholder={receiveType === 'SERIAL' ? 'SN001\nSN002\nSN003' : 'LOT-2024-001'}
                value={codesText}
                onChange={e => setCodesText(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Expiry Date (optional)</label>
              <input
                type="date"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Notes (optional)</label>
              <input
                placeholder="e.g. Received from supplier PO #123"
                value={receiveNotes}
                onChange={e => setReceiveNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
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
                {submitting ? 'Receiving…' : 'Receive'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}
