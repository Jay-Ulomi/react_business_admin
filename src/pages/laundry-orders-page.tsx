import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBusinessContext } from '../features/context/business-context'
import {
  createLaundryOrder,
  fetchLaundryOrders,
  recordLaundryPayment,
  updateLaundryStatus,
  type LaundryOrder,
  type LaundryPaymentMethod,
  type LaundryOrderStatus,
} from '../features/laundry/laundry-api'
import { fetchProducts, type ProductResponse } from '../features/products/products-api'
import { Modal } from '../features/ui/modal'
import { useToast } from '../features/ui/toast-context'
import { formatCurrency } from '../lib/format'

type DraftItem = {
  productId: string
  quantity: string
  unitPrice: string
  notes: string
}

const STATUS_OPTIONS: LaundryOrderStatus[] = ['RECEIVED', 'WASHING', 'IRONING', 'READY', 'COLLECTED', 'CANCELED']
const PAYMENT_METHOD_OPTIONS: LaundryPaymentMethod[] = ['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER']

function badgeClass(status: LaundryOrderStatus): string {
  if (status === 'RECEIVED') return 'bg-blue-100 text-blue-800'
  if (status === 'WASHING') return 'bg-cyan-100 text-cyan-800'
  if (status === 'IRONING') return 'bg-amber-100 text-amber-800'
  if (status === 'READY') return 'bg-emerald-100 text-emerald-800'
  if (status === 'COLLECTED') return 'bg-slate-200 text-slate-800'
  return 'bg-rose-100 text-rose-800'
}

function nextStatuses(status: LaundryOrderStatus): LaundryOrderStatus[] {
  if (status === 'RECEIVED') return ['WASHING', 'CANCELED']
  if (status === 'WASHING') return ['IRONING', 'CANCELED']
  if (status === 'IRONING') return ['READY', 'CANCELED']
  if (status === 'READY') return ['COLLECTED']
  return []
}

function formatDateTime(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function LaundryOrdersPage() {
  const canCreateTickets = false
  const [searchParams, setSearchParams] = useSearchParams()
  const { selectedContext } = useBusinessContext()
  const { pushToast } = useToast()

  const [orders, setOrders] = useState<LaundryOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(Number(searchParams.get('page') ?? 0))
  const [size, setSize] = useState(Number(searchParams.get('size') ?? 15))
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [status, setStatus] = useState(searchParams.get('status') ?? 'ALL')
  const [search, setSearch] = useState(searchParams.get('search') ?? '')

  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [paidAmount, setPaidAmount] = useState('0')
  const [createPaymentMethod, setCreatePaymentMethod] = useState<LaundryPaymentMethod>('CASH')
  const [createPaymentReference, setCreatePaymentReference] = useState('')
  const [items, setItems] = useState<DraftItem[]>([{ productId: '', quantity: '1', unitPrice: '0', notes: '' }])
  const [products, setProducts] = useState<ProductResponse[]>([])

  const [paymentOrder, setPaymentOrder] = useState<LaundryOrder | null>(null)
  const [detailsOrder, setDetailsOrder] = useState<LaundryOrder | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<LaundryPaymentMethod>('CASH')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const result = await fetchProducts({ isActive: true, size: 500, sortBy: 'name', sortDir: 'asc' })
        if (!cancelled) setProducts(result.content)
      } catch (err) {
        if (!cancelled) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to load products')
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [pushToast])

  useEffect(() => {
    const next = new URLSearchParams()
    if (status !== 'ALL') next.set('status', status)
    if (search.trim()) next.set('search', search.trim())
    if (page !== 0) next.set('page', String(page))
    if (size !== 15) next.set('size', String(size))
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [page, search, searchParams, setSearchParams, size, status])

  const reload = async () => {
    if (!selectedContext?.branchId) {
      setOrders([])
      setTotalElements(0)
      setTotalPages(0)
      return
    }
    setLoading(true)
    try {
      const result = await fetchLaundryOrders({
        branchId: selectedContext.branchId,
        status: status === 'ALL' ? undefined : (status as LaundryOrderStatus),
        search: search.trim() || undefined,
        page,
        size,
      })
      setOrders(result.content)
      setTotalPages(result.totalPages)
      setTotalElements(result.totalElements)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to load laundry orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [selectedContext?.branchId, status, search, page, size])

  const totalDraft = useMemo(
    () =>
      items.reduce((sum, item) => {
        const qty = Number(item.quantity)
        const price = Number(item.unitPrice)
        if (!Number.isFinite(qty) || !Number.isFinite(price)) return sum
        return sum + qty * price
      }, 0),
    [items],
  )

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateError(null)

    const mappedItems = items.map((item) => ({
      productId: item.productId,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      notes: item.notes.trim() || undefined,
    }))

    if (mappedItems.some((item) => !item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
      setCreateError('Please provide valid product, quantity, and unit price.')
      return
    }

    const paid = Number(paidAmount)
    if (!Number.isFinite(paid) || paid < 0) {
      setCreateError('Invalid paid amount.')
      return
    }

    setCreateSubmitting(true)
    try {
      await createLaundryOrder({
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
        paidAmount: paid,
        paymentMethod: paid > 0 ? createPaymentMethod : undefined,
        paymentReference: paid > 0 ? (createPaymentReference.trim() || undefined) : undefined,
        items: mappedItems,
      })
      setCreateOpen(false)
      setCustomerName('')
      setCustomerPhone('')
      setDueDate('')
      setNotes('')
      setPaidAmount('0')
      setCreatePaymentMethod('CASH')
      setCreatePaymentReference('')
      setItems([{ productId: '', quantity: '1', unitPrice: '0', notes: '' }])
      pushToast('success', 'Laundry order created.')
      await reload()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create laundry order'
      setCreateError(message)
      pushToast('error', message)
    } finally {
      setCreateSubmitting(false)
    }
  }

  const runStatus = async (order: LaundryOrder, next: LaundryOrderStatus) => {
    try {
      await updateLaundryStatus(order.id, next)
      pushToast('success', `Order ${order.ticketNumber} moved to ${next}.`)
      await reload()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  const submitPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!paymentOrder) return
    const amount = Number(paymentAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      pushToast('error', 'Payment amount must be greater than zero.')
      return
    }
    setPaymentSubmitting(true)
    try {
      await recordLaundryPayment(
        paymentOrder.id,
        amount,
        paymentMethod,
        paymentNotes.trim() || undefined,
        paymentReference.trim() || undefined,
      )
      setPaymentOrder(null)
      setPaymentAmount('')
      setPaymentMethod('CASH')
      setPaymentReference('')
      setPaymentNotes('')
      pushToast('success', 'Payment recorded.')
      await reload()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setPaymentSubmitting(false)
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Laundry</p>
          <h2 className="font-display text-xl text-slate-900">Laundry Orders</h2>
          <p className="text-sm text-slate-500">Total: {totalElements}</p>
        </div>
        {canCreateTickets ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            New Laundry Ticket
          </button>
        ) : null}
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(0)
          }}
          placeholder="Search by ticket/customer/phone"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
        />
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(0)
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="ALL">All Status</option>
          {STATUS_OPTIONS.map((row) => (
            <option key={row} value={row}>
              {row}
            </option>
          ))}
        </select>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading laundry orders...</p> : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-2 py-2 font-medium">Ticket</th>
              <th className="px-2 py-2 font-medium">Customer</th>
              <th className="px-2 py-2 font-medium">Due</th>
              <th className="px-2 py-2 font-medium">Amount</th>
              <th className="px-2 py-2 font-medium">Balance</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-slate-100">
                <td className="px-2 py-3 font-medium text-slate-800">{order.ticketNumber}</td>
                <td className="px-2 py-3 text-slate-700">
                  {order.customerName || '-'}
                  {order.customerPhone ? <p className="text-xs text-slate-500">{order.customerPhone}</p> : null}
                </td>
                <td className="px-2 py-3 text-slate-700">{order.dueDate || '-'}</td>
                <td className="px-2 py-3 text-slate-700">{formatCurrency(order.totalAmount)}</td>
                <td className="px-2 py-3 text-slate-700">{formatCurrency(order.balanceAmount)}</td>
                <td className="px-2 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClass(order.status)}`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-2 py-3">
                  <div className="flex flex-wrap items-center gap-1">
                    {nextStatuses(order.status).map((row) => (
                      <button
                        key={`${order.id}-${row}`}
                        type="button"
                        onClick={() => void runStatus(order, row)}
                        className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {row}
                      </button>
                    ))}
                    {order.balanceAmount > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentOrder(order)
                          setPaymentAmount(order.balanceAmount.toFixed(2))
                          setPaymentMethod('CASH')
                          setPaymentReference('')
                        }}
                        className="rounded border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Pay
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setDetailsOrder(order)}
                      className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Details
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!orders.length ? (
              <tr>
                <td className="px-2 py-3 text-slate-500" colSpan={7}>
                  No laundry orders found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <p className="text-slate-600">Page {page + 1} / {Math.max(1, totalPages)}</p>
        <div className="flex items-center gap-2">
          <select
            value={size}
            onChange={(event) => {
              setSize(Number(event.target.value))
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-2 py-1"
          >
            <option value={10}>10 rows</option>
            <option value={15}>15 rows</option>
            <option value={30}>30 rows</option>
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
            onClick={() => setPage((prev) => ((prev + 1) < totalPages ? prev + 1 : prev))}
            disabled={page + 1 >= totalPages}
            className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Next
          </button>
        </div>
      </div>

      {canCreateTickets && createOpen ? (
        <Modal title="Create Laundry Ticket" onClose={() => !createSubmitting && setCreateOpen(false)}>
          <form className="space-y-3" onSubmit={submitCreate}>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Customer name"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="Customer phone"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={paidAmount}
                onChange={(event) => setPaidAmount(event.target.value)}
                placeholder="Initial paid amount"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={createPaymentMethod}
                onChange={(event) => setCreatePaymentMethod(event.target.value as LaundryPaymentMethod)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {PAYMENT_METHOD_OPTIONS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
              <input
                value={createPaymentReference}
                onChange={(event) => setCreatePaymentReference(event.target.value)}
                placeholder="Initial payment reference (optional)"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notes"
                rows={2}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>

            <div className="rounded-lg border border-slate-200 p-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Items</p>
                <button
                  type="button"
                  onClick={() => setItems((prev) => [...prev, { productId: '', quantity: '1', unitPrice: '0', notes: '' }])}
                  className="rounded border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  Add Item
                </button>
              </div>
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={`item-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-5">
                    <select
                      value={item.productId}
                      onChange={(event) =>
                        setItems((prev) =>
                          prev.map((row, idx) => {
                            if (idx !== index) return row
                            const selected = products.find((p) => p.id === event.target.value)
                            return {
                              ...row,
                              productId: event.target.value,
                              unitPrice: selected ? String(selected.sellingPrice) : row.unitPrice,
                            }
                          }),
                        )
                      }
                      className="rounded-lg border border-slate-200 px-2 py-2 text-sm md:col-span-2"
                    >
                      <option value="">Select product</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={item.quantity}
                      onChange={(event) =>
                        setItems((prev) => prev.map((row, idx) => (idx === index ? { ...row, quantity: event.target.value } : row)))
                      }
                      placeholder="Qty"
                      className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    />
                    <input
                      value={item.unitPrice}
                      onChange={(event) =>
                        setItems((prev) => prev.map((row, idx) => (idx === index ? { ...row, unitPrice: event.target.value } : row)))
                      }
                      placeholder="Unit price"
                      className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== index)))}
                      className="rounded-lg border border-rose-200 px-2 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-sm text-slate-600">Draft total: {formatCurrency(totalDraft)}</p>
            </div>

            {createError ? <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{createError}</p> : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => !createSubmitting && setCreateOpen(false)}
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
                {createSubmitting ? 'Saving...' : 'Create Ticket'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {paymentOrder ? (
        <Modal title={`Record Payment • ${paymentOrder.ticketNumber}`} onClose={() => !paymentSubmitting && setPaymentOrder(null)}>
          <form className="space-y-3" onSubmit={submitPayment}>
            <p className="text-sm text-slate-600">Remaining balance: {formatCurrency(paymentOrder.balanceAmount)}</p>
            <input
              value={paymentAmount}
              onChange={(event) => setPaymentAmount(event.target.value)}
              placeholder="Amount"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as LaundryPaymentMethod)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {PAYMENT_METHOD_OPTIONS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
            <input
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
              placeholder="Payment reference (optional)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <textarea
              value={paymentNotes}
              onChange={(event) => setPaymentNotes(event.target.value)}
              placeholder="Notes"
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => !paymentSubmitting && setPaymentOrder(null)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={paymentSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                disabled={paymentSubmitting}
              >
                {paymentSubmitting ? 'Saving...' : 'Record Payment'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {detailsOrder ? (
        <Modal title={`Ticket Details • ${detailsOrder.ticketNumber}`} onClose={() => setDetailsOrder(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p className="text-slate-600">Customer</p>
              <p className="font-medium text-slate-800">{detailsOrder.customerName || '-'}</p>
              <p className="text-slate-600">Phone</p>
              <p className="font-medium text-slate-800">{detailsOrder.customerPhone || '-'}</p>
              <p className="text-slate-600">Status</p>
              <p className="font-medium text-slate-800">{detailsOrder.status}</p>
              <p className="text-slate-600">Due Date</p>
              <p className="font-medium text-slate-800">{detailsOrder.dueDate || '-'}</p>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-slate-800">Items</p>
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Item</th>
                      <th className="px-2 py-2 font-medium">Qty</th>
                      <th className="px-2 py-2 font-medium">Price</th>
                      <th className="px-2 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailsOrder.items.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-2 py-2 text-slate-700">{item.itemName}</td>
                        <td className="px-2 py-2 text-slate-700">{item.quantity}</td>
                        <td className="px-2 py-2 text-slate-700">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-2 py-2 text-slate-700">{formatCurrency(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-slate-800">Payment History</p>
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Date</th>
                      <th className="px-2 py-2 font-medium">Method</th>
                      <th className="px-2 py-2 font-medium">Reference</th>
                      <th className="px-2 py-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detailsOrder.payments ?? []).map((payment) => (
                      <tr key={payment.id} className="border-b border-slate-100">
                        <td className="px-2 py-2 text-slate-700">{formatDateTime(payment.paymentDate || payment.createdAt)}</td>
                        <td className="px-2 py-2 text-slate-700">{payment.paymentMethod}</td>
                        <td className="px-2 py-2 text-slate-700">{payment.reference || '-'}</td>
                        <td className="px-2 py-2 text-slate-700">{formatCurrency(payment.amount)}</td>
                      </tr>
                    ))}
                    {(detailsOrder.payments?.length ?? 0) === 0 ? (
                      <tr>
                        <td className="px-2 py-2 text-slate-500" colSpan={4}>
                          No payments recorded yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}
