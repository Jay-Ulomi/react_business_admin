import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBusinessContext } from '../features/context/business-context'
import {
  fetchInventoryOverview,
  fetchLowStockByBranch,
  fetchMovements,
  fetchStockByBranch,
  type InventoryOverviewResponse,
  type InventoryMovementResponse,
  type StockBalanceResponse,
} from '../features/inventory/inventory-api'
import { useToast } from '../features/ui/toast-context'
import { formatDate } from '../lib/format'

export function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { selectedContext } = useBusinessContext()
  const { pushToast } = useToast()
  const [stock, setStock] = useState<StockBalanceResponse[]>([])
  const [lowStock, setLowStock] = useState<StockBalanceResponse[]>([])
  const [movements, setMovements] = useState<InventoryMovementResponse[]>([])
  const [overview, setOverview] = useState<InventoryOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stockPage, setStockPage] = useState(Math.max(0, Number(searchParams.get('stockPage') ?? 0)))
  const [stockPageSize, setStockPageSize] = useState(() => {
    const parsed = Number(searchParams.get('stockSize') ?? 20)
    return [10, 20, 50].includes(parsed) ? parsed : 20
  })
  const [movementView, setMovementView] = useState<'ALL' | 'LAUNDRY_ONLY'>('ALL')
  const isLaundryBusiness = (selectedContext?.businessType ?? '').toUpperCase() === 'LAUNDRY'

  useEffect(() => {
    const branchId = selectedContext?.branchId
    if (!branchId) return
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const [stockRows, lowRows, movementPage, overviewData] = await Promise.all([
          fetchStockByBranch(branchId),
          fetchLowStockByBranch(branchId),
          fetchMovements({ branchId, size: 20 }),
          fetchInventoryOverview(),
        ])
        if (cancelled) return
        setStock(stockRows)
        setLowStock(lowRows)
        setMovements(movementPage.content)
        setOverview(overviewData)
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load inventory'
          setError(message)
          pushToast('error', message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [selectedContext?.branchId])

  const totals = useMemo(() => {
    const totalItems = stock.length
    const lowCount = lowStock.length
    const totalAvailable = stock.reduce((sum, row) => sum + Number(row.availableQuantity ?? 0), 0)
    return { totalItems, lowCount, totalAvailable }
  }, [lowStock.length, stock])

  const totalStockPages = Math.max(1, Math.ceil(stock.length / stockPageSize))
  const safeStockPage = Math.min(stockPage, totalStockPages - 1)
  const pagedStock = useMemo(
    () => stock.slice(safeStockPage * stockPageSize, safeStockPage * stockPageSize + stockPageSize),
    [safeStockPage, stock, stockPageSize],
  )

  const displayedMovements = useMemo(() => {
    if (movementView !== 'LAUNDRY_ONLY') return movements
    return movements.filter((m) => (m.notes ?? '').toUpperCase().startsWith('LAUNDRY_'))
  }, [movementView, movements])

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (stockPage !== 0) next.set('stockPage', String(stockPage))
    else next.delete('stockPage')
    if (stockPageSize !== 20) next.set('stockSize', String(stockPageSize))
    else next.delete('stockSize')
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams, stockPage, stockPageSize])

  if (!selectedContext?.branchId) {
    return (
      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">Select a business and branch context to view inventory.</p>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Stocked Products</p>
          <p className="mt-1 font-display text-2xl text-slate-900">{totals.totalItems}</p>
        </article>
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-sm text-amber-800">Low Stock Items</p>
          <p className="mt-1 font-display text-2xl text-amber-900">{totals.lowCount}</p>
        </article>
        <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Available Quantity</p>
          <p className="mt-1 font-display text-2xl text-slate-900">{totals.totalAvailable.toFixed(2)}</p>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Warehouse Qty</p>
          <p className="mt-1 font-display text-2xl text-slate-900">
            {(overview?.warehouseAvailableQuantity ?? 0).toFixed(2)}
          </p>
        </article>
        <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Store Qty</p>
          <p className="mt-1 font-display text-2xl text-slate-900">{(overview?.storeAvailableQuantity ?? 0).toFixed(2)}</p>
        </article>
        <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Warehouse Branches</p>
          <p className="mt-1 font-display text-2xl text-slate-900">{overview?.warehouseBranchCount ?? 0}</p>
        </article>
        <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Store Branches</p>
          <p className="mt-1 font-display text-2xl text-slate-900">{overview?.storeBranchCount ?? 0}</p>
        </article>
      </section>

      {loading ? <p className="text-sm text-slate-500">Loading inventory...</p> : null}
      {!loading && !error ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm xl:col-span-2">
            <h2 className="mb-3 font-display text-lg text-slate-900">Branch Stock</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">Product</th>
                    <th className="px-2 py-2 font-medium">Available</th>
                    <th className="px-2 py-2 font-medium">Reserved</th>
                    <th className="px-2 py-2 font-medium">Min Level</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedStock.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="px-2 py-3 font-medium text-slate-800">{row.productName}</td>
                      <td className="px-2 py-3 text-slate-700">{row.availableQuantity}</td>
                      <td className="px-2 py-3 text-slate-600">{row.reservedQuantity}</td>
                      <td className="px-2 py-3 text-slate-600">{row.minStockLevel}</td>
                      <td className="px-2 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            row.isLowStock ?? row.lowStock
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {row.isLowStock ?? row.lowStock ? 'Low' : 'Healthy'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!pagedStock.length ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-6 text-center text-sm text-slate-500">
                        No stock records found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <p className="text-slate-600">
                Showing {pagedStock.length} of {stock.length}
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={stockPageSize}
                  onChange={(event) => {
                    setStockPageSize(Number(event.target.value))
                    setStockPage(0)
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                >
                  <option value={10}>10 rows</option>
                  <option value={20}>20 rows</option>
                  <option value={50}>50 rows</option>
                </select>
                <button
                  type="button"
                  onClick={() => setStockPage((prev) => Math.max(0, prev - 1))}
                  disabled={safeStockPage === 0}
                  className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Prev
                </button>
                <span className="text-slate-600">
                  Page {safeStockPage + 1} / {totalStockPages}
                </span>
                <button
                  type="button"
                  onClick={() => setStockPage((prev) => (prev + 1 < totalStockPages ? prev + 1 : prev))}
                  disabled={safeStockPage + 1 >= totalStockPages}
                  className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Next
                </button>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-display text-lg text-slate-900">Recent Movements</h2>
              {isLaundryBusiness ? (
                <select
                  value={movementView}
                  onChange={(event) => setMovementView(event.target.value as 'ALL' | 'LAUNDRY_ONLY')}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                >
                  <option value="ALL">All</option>
                  <option value="LAUNDRY_ONLY">Laundry Only</option>
                </select>
              ) : null}
            </div>
            <div className="space-y-2">
              {displayedMovements.map((movement) => (
                <div key={movement.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">{movement.productName}</p>
                    {movement.notes?.toUpperCase().startsWith('LAUNDRY_') ? (
                      <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold text-cyan-800">
                        Laundry
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-600">
                    {movement.movementType} {movement.quantityChanged > 0 ? '+' : ''}
                    {movement.quantityChanged}
                  </p>
                  {movement.notes ? <p className="text-xs text-slate-500">{movement.notes}</p> : null}
                  <p className="text-xs text-slate-500">{formatDate(movement.createdAt)}</p>
                </div>
              ))}
              {!displayedMovements.length ? (
                <p className="text-xs text-slate-500">No movements for current filter.</p>
              ) : null}
            </div>
          </article>
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm xl:col-span-2">
            <h2 className="mb-3 font-display text-lg text-slate-900">Business Branch Inventory</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">Branch</th>
                    <th className="px-2 py-2 font-medium">Type</th>
                    <th className="px-2 py-2 font-medium">Available Qty</th>
                    <th className="px-2 py-2 font-medium">Reserved Qty</th>
                    <th className="px-2 py-2 font-medium">SKUs</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview?.branches ?? []).map((row) => (
                    <tr key={row.branchId} className="border-b border-slate-100">
                      <td className="px-2 py-3 font-medium text-slate-800">{row.branchName}</td>
                      <td className="px-2 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            row.isWarehouse ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {row.isWarehouse ? 'Warehouse' : 'Store'}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-slate-700">{row.totalAvailableQuantity}</td>
                      <td className="px-2 py-3 text-slate-700">{row.totalReservedQuantity}</td>
                      <td className="px-2 py-3 text-slate-700">{row.skuCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-display text-lg text-slate-900">Transfer Totals</h2>
            <div className="space-y-2 text-sm text-slate-700">
              <p>Total transfers: {overview?.transferMovement.totalTransfers ?? 0}</p>
              <p>Completed transfers: {overview?.transferMovement.completedTransfers ?? 0}</p>
              <p>Warehouse inbound: {(overview?.transferMovement.warehouseInboundQuantity ?? 0).toFixed(2)}</p>
              <p>Warehouse outbound: {(overview?.transferMovement.warehouseOutboundQuantity ?? 0).toFixed(2)}</p>
              <p>Total moved in: {(overview?.transferMovement.totalTransferredIn ?? 0).toFixed(2)}</p>
              <p>Total moved out: {(overview?.transferMovement.totalTransferredOut ?? 0).toFixed(2)}</p>
            </div>
          </article>
        </section>
      ) : null}
    </div>
  )
}
