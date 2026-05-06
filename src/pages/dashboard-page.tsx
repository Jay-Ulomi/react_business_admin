import { useEffect, useMemo, useState } from 'react'
import { useBusinessContext } from '../features/context/business-context'
import {
  fetchDailySalesReport,
  fetchLowStockReport,
  fetchRecentSales,
  type DailySalesReport,
  type LowStockReport,
  type SaleResponse,
} from '../features/dashboard/dashboard-api'
import { fetchInventoryOverview, type InventoryOverviewResponse } from '../features/inventory/inventory-api'
import { useToast } from '../features/ui/toast-context'
import { formatCurrency } from '../lib/format'

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function normalizeStatus(status: string): string {
  if (status === 'COMPLETED') return 'Completed'
  if (status === 'VOIDED') return 'Voided'
  if (status === 'SUSPENDED') return 'Suspended'
  return status
}

export function DashboardPage() {
  const { selectedContext } = useBusinessContext()
  const { pushToast } = useToast()
  const [dailySales, setDailySales] = useState<DailySalesReport | null>(null)
  const [lowStockReport, setLowStockReport] = useState<LowStockReport | null>(null)
  const [recentSales, setRecentSales] = useState<SaleResponse[]>([])
  const [inventoryOverview, setInventoryOverview] = useState<InventoryOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(todayIsoDate)

  useEffect(() => {
    const branchId = selectedContext?.branchId
    if (!branchId) {
      setLoading(false)
      return
    }
    let cancelled = false

    const run = async () => {
      setLoading(true)
      try {
        const [daily, lowStock, salesPage, overview] = await Promise.all([
          fetchDailySalesReport(branchId, selectedDate),
          fetchLowStockReport(branchId),
          fetchRecentSales(branchId),
          fetchInventoryOverview(),
        ])
        if (cancelled) return
        setDailySales(daily)
        setLowStockReport(lowStock)
        setRecentSales(salesPage.content)
        setInventoryOverview(overview)
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load dashboard'
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
  }, [selectedContext?.branchId, selectedDate])

  const kpis = useMemo(
    () => [
      { label: `Sales (${selectedDate})`, value: formatCurrency(dailySales?.totalSales ?? 0) },
      { label: 'Net Sales', value: formatCurrency(dailySales?.netSales ?? 0) },
      { label: 'Transactions', value: String(dailySales?.totalTransactions ?? 0) },
      { label: 'Low Stock Items', value: String(lowStockReport?.totalLowStockItems ?? 0) },
      { label: 'Warehouse Qty', value: (inventoryOverview?.warehouseAvailableQuantity ?? 0).toFixed(2) },
      { label: 'Store Qty', value: (inventoryOverview?.storeAvailableQuantity ?? 0).toFixed(2) },
    ],
    [dailySales, inventoryOverview?.storeAvailableQuantity, inventoryOverview?.warehouseAvailableQuantity, lowStockReport?.totalLowStockItems, selectedDate],
  )

  const topLowStock = lowStockReport?.items?.slice(0, 5) ?? []

  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <label className="text-sm font-semibold text-slate-600" htmlFor="dashboard-date">
          Report Date
        </label>
        <input
          id="dashboard-date"
          type="date"
          value={selectedDate}
          max={todayIsoDate()}
          onChange={(event) => setSelectedDate(event.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
        />
        {selectedDate !== todayIsoDate() ? (
          <button
            type="button"
            onClick={() => setSelectedDate(todayIsoDate())}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Today
          </button>
        ) : null}
      </div>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{kpi.label}</p>
            <p className="mt-2 font-display text-2xl font-semibold text-slate-900">{kpi.value}</p>
          </article>
        ))}
      </section>

      {loading ? <p className="mt-4 text-sm text-slate-500">Loading dashboard...</p> : null}
      {!selectedContext?.branchId ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Select a business and branch context to view dashboard data.
        </p>
      ) : null}

      <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg text-slate-900">Recent Sales</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-3 py-2 font-medium">Sale ID</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((sale) => (
                  <tr key={sale.id} className="rounded-xl bg-slate-50/80 text-slate-800">
                    <td className="rounded-l-xl px-3 py-3 font-semibold">{sale.saleNumber}</td>
                    <td className="px-3 py-3">{formatCurrency(sale.totalAmount)}</td>
                    <td className="rounded-r-xl px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          sale.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : sale.status === 'SUSPENDED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {normalizeStatus(sale.status)}
                      </span>
                    </td>
                  </tr>
                ))}
                {!recentSales.length ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-3 text-sm text-slate-500">
                      No recent sales found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <h2 className="font-display text-lg text-slate-900">Low Stock Alerts</h2>
          <p className="mt-1 text-sm text-slate-500">
            {selectedContext?.branchName ? `Restock for ${selectedContext.branchName}.` : 'Select branch context.'}
          </p>
          <div className="mt-4 space-y-3">
            {topLowStock.map((alert) => (
              <div key={alert.productId} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-slate-800">{alert.productName}</p>
                <p className="mt-1 text-xs font-semibold text-amber-900">Remaining: {alert.currentStock}</p>
              </div>
            ))}
            {!topLowStock.length ? <p className="text-sm text-slate-500">No low stock records.</p> : null}
          </div>
        </article>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <h2 className="font-display text-lg text-slate-900">Warehouse vs Stores</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p>Warehouse branches: {inventoryOverview?.warehouseBranchCount ?? 0}</p>
            <p>Store branches: {inventoryOverview?.storeBranchCount ?? 0}</p>
            <p>Warehouse SKUs: {inventoryOverview?.warehouseSkuCount ?? 0}</p>
            <p>Store SKUs: {inventoryOverview?.storeSkuCount ?? 0}</p>
          </div>
        </article>

        <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm xl:col-span-2">
          <h2 className="font-display text-lg text-slate-900">Transfer Movement</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Total Transfers</p>
              <p className="text-xl font-semibold text-slate-900">{inventoryOverview?.transferMovement.totalTransfers ?? 0}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Warehouse Inbound</p>
              <p className="text-xl font-semibold text-emerald-700">
                {(inventoryOverview?.transferMovement.warehouseInboundQuantity ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Warehouse Outbound</p>
              <p className="text-xl font-semibold text-amber-700">
                {(inventoryOverview?.transferMovement.warehouseOutboundQuantity ?? 0).toFixed(2)}
              </p>
            </div>
          </div>
        </article>
      </section>
    </>
  )
}
