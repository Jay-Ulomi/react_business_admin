import { type FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchAccountsByType,
  type AccountResponse,
} from '../features/accounting/chart-of-accounts-api'
import {
  createJournalEntry,
  fetchJournals,
  postJournalEntry,
  type JournalResponse,
} from '../features/accounting/journal-entries-api'
import { useBusinessContext } from '../features/context/business-context'
import { fetchProducts, type ProductResponse } from '../features/products/products-api'
import {
  createPurchase,
  createSupplier,
  fetchPurchase,
  fetchPurchases,
  fetchSuppliers,
  receiveGoods,
  updatePurchase,
  updateSupplier,
  type PurchaseItemResponse,
  type PurchaseResponse,
  type SupplierResponse,
} from '../features/purchases/purchases-api'
import { Modal } from '../features/ui/modal'
import { useToast } from '../features/ui/toast-context'
import { formatCurrency, formatDate } from '../lib/format'

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function weekAgoIsoDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

function monthStartIsoDate(): string {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

type PurchaseItemDraft = {
  productId: string
  quantity: string
  unitCost: string
  taxAmount: string
}

type ReceiveItemDraft = {
  purchaseItemId: string
  productName: string
  orderedQty: number
  alreadyReceivedQty: number
  remainingQty: number
  quantityReceived: string
}

export function PurchasesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const parsePositiveInt = (value: string | null, fallback: number): number => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
  }
  const parseSortDir = (value: string | null, fallback: 'asc' | 'desc'): 'asc' | 'desc' =>
    value === 'asc' || value === 'desc' ? value : fallback

  const { selectedContext } = useBusinessContext()
  const { pushToast } = useToast()
  const [purchases, setPurchases] = useState<PurchaseResponse[]>([])
  const [suppliers, setSuppliers] = useState<SupplierResponse[]>([])
  const [products, setProducts] = useState<ProductResponse[]>([])
  const [page, setPage] = useState(parsePositiveInt(searchParams.get('page'), 0))
  const [size, setSize] = useState(parsePositiveInt(searchParams.get('size'), 15))
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? 'ALL')
  const [fromDate, setFromDate] = useState(searchParams.get('from') ?? weekAgoIsoDate())
  const [toDate, setToDate] = useState(searchParams.get('to') ?? todayIsoDate())
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') ?? 'purchaseDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(parseSortDir(searchParams.get('sortDir'), 'desc'))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [purchaseRefreshKey, setPurchaseRefreshKey] = useState(0)
  const [supplierRefreshKey, setSupplierRefreshKey] = useState(0)

  const [createSupplierModalOpen, setCreateSupplierModalOpen] = useState(false)
  const [createSupplierSubmitting, setCreateSupplierSubmitting] = useState(false)
  const [createSupplierError, setCreateSupplierError] = useState<string | null>(null)
  const [createSupplierForm, setCreateSupplierForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    city: '',
    country: '',
  })
  const [editSupplierModalOpen, setEditSupplierModalOpen] = useState(false)
  const [editSupplierSubmitting, setEditSupplierSubmitting] = useState(false)
  const [editSupplierError, setEditSupplierError] = useState<string | null>(null)
  const [editSupplierId, setEditSupplierId] = useState<string | null>(null)
  const [editSupplierForm, setEditSupplierForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    city: '',
    country: '',
    isActive: true,
  })

  const [createPurchaseModalOpen, setCreatePurchaseModalOpen] = useState(false)
  const [createPurchaseSubmitting, setCreatePurchaseSubmitting] = useState(false)
  const [createPurchaseError, setCreatePurchaseError] = useState<string | null>(null)
  const [createPurchaseForm, setCreatePurchaseForm] = useState({
    supplierId: '',
    purchaseDate: todayIsoDate(),
    expectedDeliveryDate: '',
    notes: '',
    items: [{ productId: '', quantity: '1', unitCost: '0', taxAmount: '0' }] as PurchaseItemDraft[],
  })
  const [editPurchaseModalOpen, setEditPurchaseModalOpen] = useState(false)
  const [editPurchaseSubmitting, setEditPurchaseSubmitting] = useState(false)
  const [editPurchaseError, setEditPurchaseError] = useState<string | null>(null)
  const [editPurchaseId, setEditPurchaseId] = useState<string | null>(null)
  const [editPurchaseForm, setEditPurchaseForm] = useState({
    supplierId: '',
    expectedDeliveryDate: '',
    notes: '',
  })
  const [receiveModalOpen, setReceiveModalOpen] = useState(false)
  const [receiveSubmitting, setReceiveSubmitting] = useState(false)
  const [receiveError, setReceiveError] = useState<string | null>(null)
  const [receivePurchase, setReceivePurchase] = useState<PurchaseResponse | null>(null)
  const [receiveForm, setReceiveForm] = useState({
    receiptDate: todayIsoDate(),
    notes: '',
    items: [] as ReceiveItemDraft[],
  })

  // JE state — shown after goods are received
  const [jeOpen, setJeOpen] = useState(false)
  const [jeTotal, setJeTotal] = useState(0)
  const [jePurchaseNumber, setJePurchaseNumber] = useState('')
  const [jePurchaseId, setJePurchaseId] = useState('')
  const [journals, setJournals] = useState<JournalResponse[]>([])
  const [assetAccounts, setAssetAccounts] = useState<AccountResponse[]>([])
  const [liabilityAccounts, setLiabilityAccounts] = useState<AccountResponse[]>([])
  const [jeJournalId, setJeJournalId] = useState('')
  const [jeDebitId, setJeDebitId] = useState('')
  const [jeCreditId, setJeCreditId] = useState('')
  const [jeSubmitting, setJeSubmitting] = useState(false)
  const [jeError, setJeError] = useState<string | null>(null)

  const applyDatePreset = (preset: 'today' | 'last7' | 'month') => {
    const today = todayIsoDate()
    if (preset === 'today') {
      setFromDate(today)
      setToDate(today)
    } else if (preset === 'last7') {
      setFromDate(weekAgoIsoDate())
      setToDate(today)
    } else {
      setFromDate(monthStartIsoDate())
      setToDate(today)
    }
    setPage(0)
  }

  useEffect(() => {
    const next = new URLSearchParams()
    if (statusFilter !== 'ALL') next.set('status', statusFilter)
    if (fromDate !== weekAgoIsoDate()) next.set('from', fromDate)
    if (toDate !== todayIsoDate()) next.set('to', toDate)
    if (sortBy !== 'purchaseDate') next.set('sortBy', sortBy)
    if (sortDir !== 'desc') next.set('sortDir', sortDir)
    if (page !== 0) next.set('page', String(page))
    if (size !== 15) next.set('size', String(size))
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [fromDate, page, searchParams, setSearchParams, size, sortBy, sortDir, statusFilter, toDate])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const [purchasePage, supplierPage, productPage] = await Promise.all([
          fetchPurchases({
            branchId: selectedContext?.branchId,
            status: statusFilter === 'ALL' ? undefined : statusFilter,
            fromDate,
            toDate,
            page,
            size,
            sortBy,
            sortDir,
          }),
          fetchSuppliers({ isActive: true, size: 100 }),
          fetchProducts({ isActive: true, size: 200, sortBy: 'name', sortDir: 'asc' }),
        ])
        if (cancelled) return
        setPurchases(purchasePage.content)
        setTotalPages(purchasePage.totalPages)
        setTotalElements(purchasePage.totalElements)
        setSuppliers(supplierPage.content)
        setProducts(productPage.content)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load purchases')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [
    fromDate,
    page,
    purchaseRefreshKey,
    selectedContext?.branchId,
    size,
    sortBy,
    sortDir,
    statusFilter,
    supplierRefreshKey,
    toDate,
  ])

  const resetCreateSupplierForm = () => {
    setCreateSupplierForm({
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      city: '',
      country: '',
    })
    setCreateSupplierError(null)
  }

  const openCreateSupplierModal = () => {
    resetCreateSupplierForm()
    setCreateSupplierModalOpen(true)
  }

  const closeCreateSupplierModal = () => {
    if (createSupplierSubmitting) return
    setCreateSupplierModalOpen(false)
    setCreateSupplierError(null)
  }

  const submitCreateSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateSupplierError(null)
    if (!createSupplierForm.name.trim()) {
      setCreateSupplierError('Supplier name is required.')
      pushToast('error', 'Supplier name is required.')
      return
    }

    setCreateSupplierSubmitting(true)
    try {
      await createSupplier({
        name: createSupplierForm.name.trim(),
        contactPerson: createSupplierForm.contactPerson.trim() || undefined,
        phone: createSupplierForm.phone.trim() || undefined,
        email: createSupplierForm.email.trim() || undefined,
        city: createSupplierForm.city.trim() || undefined,
        country: createSupplierForm.country.trim() || undefined,
      })
      setCreateSupplierModalOpen(false)
      setSupplierRefreshKey((value) => value + 1)
      pushToast('success', 'Supplier created successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create supplier'
      setCreateSupplierError(message)
      pushToast('error', message)
    } finally {
      setCreateSupplierSubmitting(false)
    }
  }

  const openEditSupplierModal = (supplier: SupplierResponse) => {
    setEditSupplierId(supplier.id)
    setEditSupplierForm({
      name: supplier.name ?? '',
      contactPerson: supplier.contactPerson ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      city: supplier.city ?? '',
      country: '',
      isActive: supplier.isActive ?? supplier.active ?? true,
    })
    setEditSupplierError(null)
    setEditSupplierModalOpen(true)
  }

  const closeEditSupplierModal = () => {
    if (editSupplierSubmitting) return
    setEditSupplierModalOpen(false)
    setEditSupplierError(null)
    setEditSupplierId(null)
  }

  const submitEditSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEditSupplierError(null)
    if (!editSupplierId) return
    if (!editSupplierForm.name.trim()) {
      setEditSupplierError('Supplier name is required.')
      pushToast('error', 'Supplier name is required.')
      return
    }
    setEditSupplierSubmitting(true)
    try {
      await updateSupplier(editSupplierId, {
        name: editSupplierForm.name.trim(),
        contactPerson: editSupplierForm.contactPerson.trim() || undefined,
        phone: editSupplierForm.phone.trim() || undefined,
        email: editSupplierForm.email.trim() || undefined,
        city: editSupplierForm.city.trim() || undefined,
        country: editSupplierForm.country.trim() || undefined,
        isActive: editSupplierForm.isActive,
      })
      setEditSupplierModalOpen(false)
      setEditSupplierId(null)
      setSupplierRefreshKey((value) => value + 1)
      pushToast('success', 'Supplier updated successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update supplier'
      setEditSupplierError(message)
      pushToast('error', message)
    } finally {
      setEditSupplierSubmitting(false)
    }
  }

  const resetCreatePurchaseForm = () => {
    setCreatePurchaseForm({
      supplierId: '',
      purchaseDate: todayIsoDate(),
      expectedDeliveryDate: '',
      notes: '',
      items: [{ productId: '', quantity: '1', unitCost: '0', taxAmount: '0' }],
    })
    setCreatePurchaseError(null)
  }

  const openCreatePurchaseModal = () => {
    resetCreatePurchaseForm()
    setCreatePurchaseModalOpen(true)
  }

  const closeCreatePurchaseModal = () => {
    if (createPurchaseSubmitting) return
    setCreatePurchaseModalOpen(false)
    setCreatePurchaseError(null)
  }

  const updateDraftItem = (index: number, patch: Partial<PurchaseItemDraft>) => {
    setCreatePurchaseForm((prev) => ({
      ...prev,
      items: prev.items.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    }))
  }

  const addDraftItem = () => {
    setCreatePurchaseForm((prev) => ({
      ...prev,
      items: [...prev.items, { productId: '', quantity: '1', unitCost: '0', taxAmount: '0' }],
    }))
  }

  const removeDraftItem = (index: number) => {
    setCreatePurchaseForm((prev) => {
      if (prev.items.length === 1) return prev
      return {
        ...prev,
        items: prev.items.filter((_, idx) => idx !== index),
      }
    })
  }

  const selectItemProduct = (index: number, productId: string) => {
    const selectedProduct = products.find((product) => product.id === productId)
    const defaultCost = selectedProduct?.costPrice ?? selectedProduct?.sellingPrice ?? 0
    updateDraftItem(index, {
      productId,
      unitCost: String(defaultCost),
    })
  }

  const submitCreatePurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreatePurchaseError(null)

    if (!selectedContext?.branchId) {
      setCreatePurchaseError('Select a business context before creating a purchase order.')
      pushToast('error', 'Select a business context before creating a purchase order.')
      return
    }
    if (!createPurchaseForm.supplierId) {
      setCreatePurchaseError('Supplier is required.')
      pushToast('error', 'Supplier is required.')
      return
    }
    if (createPurchaseForm.items.length === 0) {
      setCreatePurchaseError('Add at least one item.')
      pushToast('error', 'Add at least one item.')
      return
    }

    const parsedItems = [] as Array<{ productId: string; quantity: number; unitCost: number; taxAmount?: number }>
    for (let i = 0; i < createPurchaseForm.items.length; i += 1) {
      const row = createPurchaseForm.items[i]
      if (!row.productId) {
        setCreatePurchaseError(`Select product on line ${i + 1}.`)
        pushToast('error', `Select product on line ${i + 1}.`)
        return
      }
      const quantity = Number(row.quantity)
      const unitCost = Number(row.unitCost)
      const taxAmount = row.taxAmount.trim() === '' ? 0 : Number(row.taxAmount)
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setCreatePurchaseError(`Quantity must be > 0 on line ${i + 1}.`)
        pushToast('error', `Quantity must be > 0 on line ${i + 1}.`)
        return
      }
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        setCreatePurchaseError(`Unit cost must be >= 0 on line ${i + 1}.`)
        pushToast('error', `Unit cost must be >= 0 on line ${i + 1}.`)
        return
      }
      if (!Number.isFinite(taxAmount) || taxAmount < 0) {
        setCreatePurchaseError(`Tax amount must be >= 0 on line ${i + 1}.`)
        pushToast('error', `Tax amount must be >= 0 on line ${i + 1}.`)
        return
      }
      parsedItems.push({
        productId: row.productId,
        quantity,
        unitCost,
        taxAmount: taxAmount === 0 ? undefined : taxAmount,
      })
    }

    setCreatePurchaseSubmitting(true)
    try {
      await createPurchase({
        branchId: selectedContext.branchId,
        supplierId: createPurchaseForm.supplierId,
        purchaseDate: createPurchaseForm.purchaseDate || undefined,
        expectedDeliveryDate: createPurchaseForm.expectedDeliveryDate || undefined,
        notes: createPurchaseForm.notes.trim() || undefined,
        items: parsedItems,
      })
      setCreatePurchaseModalOpen(false)
      setStatusFilter('ALL')
      setPage(0)
      setPurchaseRefreshKey((value) => value + 1)
      pushToast('success', 'Purchase order created successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create purchase order'
      setCreatePurchaseError(message)
      pushToast('error', message)
    } finally {
      setCreatePurchaseSubmitting(false)
    }
  }

  const openEditPurchaseModal = (purchase: PurchaseResponse) => {
    setEditPurchaseId(purchase.id)
    setEditPurchaseForm({
      supplierId: purchase.supplierId ?? '',
      expectedDeliveryDate: purchase.expectedDeliveryDate ?? '',
      notes: purchase.notes ?? '',
    })
    setEditPurchaseError(null)
    setEditPurchaseModalOpen(true)
  }

  const closeEditPurchaseModal = () => {
    if (editPurchaseSubmitting) return
    setEditPurchaseModalOpen(false)
    setEditPurchaseError(null)
    setEditPurchaseId(null)
  }

  const submitEditPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEditPurchaseError(null)
    if (!editPurchaseId) return
    if (!editPurchaseForm.supplierId) {
      setEditPurchaseError('Supplier is required.')
      pushToast('error', 'Supplier is required.')
      return
    }
    setEditPurchaseSubmitting(true)
    try {
      await updatePurchase(editPurchaseId, {
        supplierId: editPurchaseForm.supplierId,
        expectedDeliveryDate: editPurchaseForm.expectedDeliveryDate || undefined,
        notes: editPurchaseForm.notes.trim() || undefined,
      })
      setEditPurchaseModalOpen(false)
      setEditPurchaseId(null)
      setPurchaseRefreshKey((value) => value + 1)
      pushToast('success', 'Purchase order updated successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update purchase order'
      setEditPurchaseError(message)
      pushToast('error', message)
    } finally {
      setEditPurchaseSubmitting(false)
    }
  }

  const canReceivePurchase = (status?: string) =>
    status === 'DRAFT' || status === 'ORDERED' || status === 'PARTIALLY_RECEIVED'

  const toNumber = (value: unknown): number => {
    const parsed = Number(value ?? 0)
    return Number.isFinite(parsed) ? parsed : 0
  }

  const buildReceiveItems = (items: PurchaseItemResponse[] | undefined): ReceiveItemDraft[] => {
    return (items ?? [])
      .map((item) => {
        const orderedQty = toNumber(item.quantity)
        const alreadyReceivedQty = toNumber(item.receivedQuantity)
        const remainingQty = Math.max(0, orderedQty - alreadyReceivedQty)
        return {
          purchaseItemId: item.id,
          productName: item.productName,
          orderedQty,
          alreadyReceivedQty,
          remainingQty,
          quantityReceived: remainingQty > 0 ? String(remainingQty) : '0',
        }
      })
      .filter((item) => item.remainingQty > 0)
  }

  const openReceiveModal = async (purchaseId: string) => {
    setReceiveError(null)
    try {
      const purchase = await fetchPurchase(purchaseId)
      if (!canReceivePurchase(purchase.status)) {
        pushToast('error', `Cannot receive goods for status ${purchase.status}.`)
        return
      }
      const items = buildReceiveItems(purchase.items)
      if (!items.length) {
        pushToast('error', 'All items are already received for this purchase.')
        return
      }
      setReceivePurchase(purchase)
      setReceiveForm({
        receiptDate: todayIsoDate(),
        notes: '',
        items,
      })
      setReceiveModalOpen(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load purchase items'
      setReceiveError(message)
      pushToast('error', message)
    }
  }

  const closeReceiveModal = () => {
    if (receiveSubmitting) return
    setReceiveModalOpen(false)
    setReceiveError(null)
    setReceivePurchase(null)
  }

  const updateReceiveItem = (index: number, quantityReceived: string) => {
    setReceiveForm((prev) => ({
      ...prev,
      items: prev.items.map((item, idx) => (idx === index ? { ...item, quantityReceived } : item)),
    }))
  }

  const submitReceiveGoods = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setReceiveError(null)
    if (!receivePurchase) return

    const payloadItems: Array<{ purchaseItemId: string; quantityReceived: number }> = []

    for (const row of receiveForm.items) {
      const quantity = Number(row.quantityReceived)
      if (!Number.isFinite(quantity) || quantity < 0) {
        const message = `Invalid received quantity for ${row.productName}.`
        setReceiveError(message)
        pushToast('error', message)
        return
      }
      if (quantity > row.remainingQty) {
        const message = `Received quantity for ${row.productName} cannot exceed remaining (${row.remainingQty}).`
        setReceiveError(message)
        pushToast('error', message)
        return
      }
      if (quantity > 0) {
        payloadItems.push({ purchaseItemId: row.purchaseItemId, quantityReceived: quantity })
      }
    }

    if (!payloadItems.length) {
      const message = 'Enter at least one item quantity greater than zero.'
      setReceiveError(message)
      pushToast('error', message)
      return
    }

    // Compute total received value: qty × unitCost per item
    const totalReceived = payloadItems.reduce((sum, payload) => {
      const purchaseItem = receivePurchase.items?.find((i) => i.id === payload.purchaseItemId)
      const unitCost = toNumber(purchaseItem?.unitCost)
      return sum + payload.quantityReceived * unitCost
    }, 0)

    const capturedPurchase = receivePurchase

    setReceiveSubmitting(true)
    try {
      await receiveGoods(receivePurchase.id, {
        receiptDate: receiveForm.receiptDate || undefined,
        notes: receiveForm.notes.trim() || undefined,
        items: payloadItems,
      })
      setReceiveModalOpen(false)
      setReceivePurchase(null)
      setPurchaseRefreshKey((value) => value + 1)
      pushToast('success', 'Goods received successfully.')

      // Open JE modal for inventory / AP entry
      if (totalReceived > 0) {
        try {
          const [journalList, assetList, liabList] = await Promise.all([
            fetchJournals(),
            fetchAccountsByType('ASSET'),
            fetchAccountsByType('LIABILITY'),
          ])
          setJournals(journalList)
          setAssetAccounts(assetList)
          setLiabilityAccounts(liabList)
          setJeJournalId(journalList[0]?.id ?? '')
          setJeDebitId('')
          setJeCreditId('')
          setJeTotal(totalReceived)
          setJePurchaseNumber(capturedPurchase.purchaseNumber ?? '')
          setJePurchaseId(capturedPurchase.id)
          setJeError(null)
          setJeOpen(true)
        } catch {
          // Non-critical: goods were received, JE is optional
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to receive goods'
      setReceiveError(message)
      pushToast('error', message)
    } finally {
      setReceiveSubmitting(false)
    }
  }

  const handleSubmitReceiveJE = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setJeError(null)
    if (!jeJournalId) { setJeError('Select a journal.'); return }
    if (!jeDebitId) { setJeError('Select the Inventory account (debit).'); return }
    if (!jeCreditId) { setJeError('Select the Accounts Payable account (credit).'); return }
    if (jeDebitId === jeCreditId) { setJeError('Debit and credit accounts must differ.'); return }

    setJeSubmitting(true)
    try {
      const entry = await createJournalEntry({
        journalId: jeJournalId,
        branchId: selectedContext?.branchId,
        entryDate: new Date().toISOString(),
        description: `Goods received – PO ${jePurchaseNumber}`,
        referenceType: 'PURCHASE',
        referenceId: jePurchaseId,
        lines: [
          { accountId: jeDebitId, debitAmount: jeTotal, creditAmount: 0, description: 'Inventory received' },
          { accountId: jeCreditId, debitAmount: 0, creditAmount: jeTotal, description: 'Accounts payable' },
        ],
      })
      await postJournalEntry(entry.id)
      setJeOpen(false)
      pushToast('success', 'Journal entry posted: Dr Inventory / Cr Accounts Payable.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to post journal entry'
      setJeError(message)
      pushToast('error', message)
    } finally {
      setJeSubmitting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm xl:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-xl text-slate-900">Purchase Orders</h2>
          <button
            type="button"
            onClick={openCreatePurchaseModal}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Create Purchase
          </button>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => applyDatePreset('today')}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => applyDatePreset('last7')}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => applyDatePreset('month')}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            This Month
          </button>
        </div>
        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-6">
          <select
            aria-label="Status filter"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="ORDERED">ORDERED</option>
            <option value="PARTIALLY_RECEIVED">PARTIALLY_RECEIVED</option>
            <option value="RECEIVED">RECEIVED</option>
            <option value="CANCELED">CANCELED</option>
          </select>
          <input
            aria-label="From date"
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            aria-label="To date"
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            aria-label="Sort by"
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="purchaseDate">Sort: Purchase Date</option>
            <option value="totalAmount">Sort: Total Amount</option>
            <option value="status">Sort: Status</option>
            <option value="createdAt">Sort: Created At</option>
          </select>
          <select
            aria-label="Sort direction"
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
          <select
            aria-label="Rows per page"
            value={size}
            onChange={(event) => {
              setSize(Number(event.target.value))
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value={10}>10 rows</option>
            <option value={15}>15 rows</option>
            <option value={25}>25 rows</option>
          </select>
        </div>
        {loading ? <p className="text-sm text-slate-500">Loading purchase orders...</p> : null}
        {!loading && !error ? (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">PO #</th>
                    <th className="px-2 py-2 font-medium">Supplier</th>
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Total</th>
                    <th className="px-2 py-2 font-medium">Balance</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => (
                    <tr key={purchase.id} className="border-b border-slate-100">
                      <td className="px-2 py-3 font-semibold text-slate-800">{purchase.purchaseNumber}</td>
                      <td className="px-2 py-3 text-slate-700">{purchase.supplierName}</td>
                      <td className="px-2 py-3 text-slate-600">{formatDate(purchase.purchaseDate)}</td>
                      <td className="px-2 py-3 text-slate-700">{formatCurrency(purchase.totalAmount)}</td>
                      <td className="px-2 py-3 text-slate-700">{formatCurrency(purchase.balanceDue)}</td>
                      <td className="px-2 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                          {purchase.status}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditPurchaseModal(purchase)}
                            disabled={purchase.status !== 'DRAFT'}
                            className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            title={purchase.status === 'DRAFT' ? 'Edit purchase' : 'Only DRAFT can be edited'}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void openReceiveModal(purchase.id)}
                            disabled={!canReceivePurchase(purchase.status)}
                            className="rounded-lg border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                            title={canReceivePurchase(purchase.status) ? 'Receive goods' : 'Already finalized'}
                          >
                            Receive
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-sm">
              <p className="text-slate-600">
                Total: {totalElements} | Page {totalPages === 0 ? 0 : page + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
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
      </section>

      <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-lg text-slate-900">Top Suppliers</h2>
          <button
            type="button"
            onClick={openCreateSupplierModal}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Add Supplier
          </button>
        </div>
        <div className="space-y-2">
          {suppliers.map((supplier) => (
            <article key={supplier.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">{supplier.name}</p>
                <button
                  type="button"
                  onClick={() => openEditSupplierModal(supplier)}
                  className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  Edit
                </button>
              </div>
              <p className="text-xs text-slate-600">{supplier.contactPerson || 'No contact person'}</p>
              <p className="text-xs text-slate-500">{supplier.phone || supplier.email || supplier.city || '-'}</p>
            </article>
          ))}
        </div>
      </section>

      {createSupplierModalOpen ? (
        <Modal title="Create Supplier" onClose={closeCreateSupplierModal}>
            <form className="space-y-3" onSubmit={submitCreateSupplier}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  value={createSupplierForm.name}
                  onChange={(event) => setCreateSupplierForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Supplier name *"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  value={createSupplierForm.contactPerson}
                  onChange={(event) =>
                    setCreateSupplierForm((prev) => ({ ...prev, contactPerson: event.target.value }))
                  }
                  placeholder="Contact person"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  value={createSupplierForm.phone}
                  onChange={(event) => setCreateSupplierForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="Phone"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  value={createSupplierForm.email}
                  onChange={(event) => setCreateSupplierForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="Email"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  value={createSupplierForm.city}
                  onChange={(event) => setCreateSupplierForm((prev) => ({ ...prev, city: event.target.value }))}
                  placeholder="City"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  value={createSupplierForm.country}
                  onChange={(event) => setCreateSupplierForm((prev) => ({ ...prev, country: event.target.value }))}
                  placeholder="Country"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              {createSupplierError ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{createSupplierError}</p>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreateSupplierModal}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  disabled={createSupplierSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  disabled={createSupplierSubmitting}
                >
                  {createSupplierSubmitting ? 'Creating...' : 'Create Supplier'}
                </button>
              </div>
            </form>
        </Modal>
      ) : null}

      {createPurchaseModalOpen ? (
        <Modal title="Create Purchase Order" onClose={closeCreatePurchaseModal} maxWidthClass="max-w-3xl">
            <form className="space-y-4" onSubmit={submitCreatePurchase}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <select
                  aria-label="Supplier"
                  value={createPurchaseForm.supplierId}
                  onChange={(event) => setCreatePurchaseForm((prev) => ({ ...prev, supplierId: event.target.value }))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select supplier *</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Purchase date"
                  type="date"
                  value={createPurchaseForm.purchaseDate}
                  onChange={(event) => setCreatePurchaseForm((prev) => ({ ...prev, purchaseDate: event.target.value }))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  aria-label="Expected delivery date"
                  type="date"
                  value={createPurchaseForm.expectedDeliveryDate}
                  onChange={(event) =>
                    setCreatePurchaseForm((prev) => ({ ...prev, expectedDeliveryDate: event.target.value }))
                  }
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <textarea
                value={createPurchaseForm.notes}
                onChange={(event) => setCreatePurchaseForm((prev) => ({ ...prev, notes: event.target.value }))}
                rows={2}
                placeholder="Notes"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />

              <div className="rounded-lg border border-slate-200">
                <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                  <div className="col-span-5">Product</div>
                  <div className="col-span-2">Qty</div>
                  <div className="col-span-2">Unit Cost</div>
                  <div className="col-span-2">Tax</div>
                  <div className="col-span-1 text-right">Action</div>
                </div>
                <div className="space-y-2 p-3">
                  {createPurchaseForm.items.map((item, index) => (
                    <div key={`item-${index}`} className="grid grid-cols-12 gap-2">
                      <select
                        aria-label="Product"
                        value={item.productId}
                        onChange={(event) => selectItemProduct(index, event.target.value)}
                        className="col-span-5 rounded-lg border border-slate-200 px-2 py-2 text-sm"
                      >
                        <option value="">Select product</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label="Quantity"
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={item.quantity}
                        onChange={(event) => updateDraftItem(index, { quantity: event.target.value })}
                        className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-sm"
                      />
                      <input
                        aria-label="Unit cost"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitCost}
                        onChange={(event) => updateDraftItem(index, { unitCost: event.target.value })}
                        className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-sm"
                      />
                      <input
                        aria-label="Tax amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.taxAmount}
                        onChange={(event) => updateDraftItem(index, { taxAmount: event.target.value })}
                        className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeDraftItem(index)}
                        className="col-span-1 rounded-lg border border-rose-200 px-2 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        disabled={createPurchaseForm.items.length === 1}
                      >
                        Del
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addDraftItem}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Add Line
                  </button>
                </div>
              </div>

              {createPurchaseError ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{createPurchaseError}</p>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreatePurchaseModal}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  disabled={createPurchaseSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  disabled={createPurchaseSubmitting}
                >
                  {createPurchaseSubmitting ? 'Creating...' : 'Create Purchase'}
                </button>
              </div>
            </form>
        </Modal>
      ) : null}

      {receiveModalOpen ? (
        <Modal
          title={`Receive Goods${receivePurchase?.purchaseNumber ? ` • ${receivePurchase.purchaseNumber}` : ''}`}
          onClose={closeReceiveModal}
          maxWidthClass="max-w-3xl"
        >
          <form className="space-y-4" onSubmit={submitReceiveGoods}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                aria-label="Receipt date"
                type="date"
                value={receiveForm.receiptDate}
                onChange={(event) => setReceiveForm((prev) => ({ ...prev, receiptDate: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                aria-label="Supplier"
                value={receivePurchase?.supplierName ?? ''}
                disabled
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
              />
            </div>

            <textarea
              value={receiveForm.notes}
              onChange={(event) => setReceiveForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={2}
              placeholder="Receipt notes"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-2 py-2 font-medium">Product</th>
                    <th className="px-2 py-2 font-medium">Ordered</th>
                    <th className="px-2 py-2 font-medium">Received</th>
                    <th className="px-2 py-2 font-medium">Remaining</th>
                    <th className="px-2 py-2 font-medium">Receive Now</th>
                  </tr>
                </thead>
                <tbody>
                  {receiveForm.items.map((item, index) => (
                    <tr key={item.purchaseItemId} className="border-b border-slate-100">
                      <td className="px-2 py-2 text-slate-800">{item.productName}</td>
                      <td className="px-2 py-2 text-slate-700">{item.orderedQty}</td>
                      <td className="px-2 py-2 text-slate-700">{item.alreadyReceivedQty}</td>
                      <td className="px-2 py-2 text-slate-700">{item.remainingQty}</td>
                      <td className="px-2 py-2">
                        <input
                          aria-label={`Receive quantity for ${item.productName}`}
                          type="number"
                          min="0"
                          max={item.remainingQty}
                          step="0.0001"
                          value={item.quantityReceived}
                          onChange={(event) => updateReceiveItem(index, event.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {receiveError ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{receiveError}</p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeReceiveModal}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={receiveSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                disabled={receiveSubmitting}
              >
                {receiveSubmitting ? 'Receiving...' : 'Receive Goods'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editSupplierModalOpen ? (
        <Modal title="Edit Supplier" onClose={closeEditSupplierModal}>
          <form className="space-y-3" onSubmit={submitEditSupplier}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={editSupplierForm.name}
                onChange={(event) => setEditSupplierForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Supplier name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editSupplierForm.contactPerson}
                onChange={(event) =>
                  setEditSupplierForm((prev) => ({ ...prev, contactPerson: event.target.value }))
                }
                placeholder="Contact person"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editSupplierForm.phone}
                onChange={(event) => setEditSupplierForm((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="Phone"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editSupplierForm.email}
                onChange={(event) => setEditSupplierForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Email"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editSupplierForm.city}
                onChange={(event) => setEditSupplierForm((prev) => ({ ...prev, city: event.target.value }))}
                placeholder="City"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editSupplierForm.country}
                onChange={(event) => setEditSupplierForm((prev) => ({ ...prev, country: event.target.value }))}
                placeholder="Country"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <label className="md:col-span-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editSupplierForm.isActive}
                  onChange={(event) =>
                    setEditSupplierForm((prev) => ({ ...prev, isActive: event.target.checked }))
                  }
                />
                Active
              </label>
            </div>

            {editSupplierError ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{editSupplierError}</p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeEditSupplierModal}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={editSupplierSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                disabled={editSupplierSubmitting}
              >
                {editSupplierSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {jeOpen ? (
        <Modal
          title={`Journal Entry – Goods Received${jePurchaseNumber ? ` • ${jePurchaseNumber}` : ''}`}
          onClose={() => setJeOpen(false)}
        >
          <form className="space-y-3" onSubmit={handleSubmitReceiveJE}>
            <p className="text-sm text-slate-600">
              Record the inventory receipt: <strong>Dr Inventory / Cr Accounts Payable</strong>
            </p>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm">
              <span className="font-semibold text-emerald-800">Total received value: </span>
              <span className="text-emerald-700">{formatCurrency(jeTotal)}</span>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Journal</label>
                <select
                  aria-label="Journal"
                  value={jeJournalId}
                  onChange={(event) => setJeJournalId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select journal…</option>
                  {journals.map((j) => (
                    <option key={j.id} value={j.id}>{j.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Debit — Inventory (Asset)</label>
                <select
                  aria-label="Debit account (Inventory)"
                  value={jeDebitId}
                  onChange={(event) => setJeDebitId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select asset account…</option>
                  {assetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} – {a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Credit — Accounts Payable (Liability)</label>
                <select
                  aria-label="Credit account (Accounts Payable)"
                  value={jeCreditId}
                  onChange={(event) => setJeCreditId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select liability account…</option>
                  {liabilityAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} – {a.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {jeError ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{jeError}</p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setJeOpen(false)}
                disabled={jeSubmitting}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Skip
              </button>
              <button
                type="submit"
                disabled={jeSubmitting}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {jeSubmitting ? 'Posting…' : 'Post Entry'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editPurchaseModalOpen ? (
        <Modal title="Edit Purchase Order" onClose={closeEditPurchaseModal}>
          <form className="space-y-3" onSubmit={submitEditPurchase}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                aria-label="Supplier"
                value={editPurchaseForm.supplierId}
                onChange={(event) => setEditPurchaseForm((prev) => ({ ...prev, supplierId: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select supplier *</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              <input
                aria-label="Expected delivery date"
                type="date"
                value={editPurchaseForm.expectedDeliveryDate}
                onChange={(event) =>
                  setEditPurchaseForm((prev) => ({ ...prev, expectedDeliveryDate: event.target.value }))
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <textarea
              value={editPurchaseForm.notes}
              onChange={(event) => setEditPurchaseForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={3}
              placeholder="Notes"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />

            {editPurchaseError ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{editPurchaseError}</p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeEditPurchaseModal}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={editPurchaseSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                disabled={editPurchaseSubmitting}
              >
                {editPurchaseSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
