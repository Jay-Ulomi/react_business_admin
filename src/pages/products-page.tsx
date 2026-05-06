import * as XLSX from 'xlsx'
import { type FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  createProduct,
  createVariant,
  deactivateProduct,
  deactivateVariant,
  fetchProducts,
  fetchVariants,
  updateProduct,
  updateVariant,
  type CreateVariantRequest,
  type ProductResponse,
  type ProductVariantResponse,
} from '../features/products/products-api'
import { fetchCategories, type ProductCategory } from '../features/categories/categories-api'
import { fetchUnits, type ProductUnit } from '../features/units/units-api'
import { Modal } from '../features/ui/modal'
import { ConfirmModal, type ConfirmState } from '../features/ui/confirm-modal'
import { useToast } from '../features/ui/toast-context'
import { formatCurrency } from '../lib/format'

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024

const CSV_TEMPLATE_HEADERS = [
  'name',
  'sku',
  'barcode',
  'description',
  'category',
  'unit',
  'costPrice',
  'sellingPrice',
  'taxRate',
  'isTaxable',
  'minStockLevel',
  'allowDecimalQuantity',
] as const

type ImportRow = {
  name: string
  sku: string
  barcode: string
  description: string
  category: string
  unit: string
  costPrice: string
  sellingPrice: string
  taxRate: string
  isTaxable: boolean
  minStockLevel: string
  allowDecimalQuantity: boolean
  _error?: string
}

function parseCsvLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') return line.split('\t')
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function parseCsvText(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  // Auto-detect delimiter: tab takes priority, then comma, then semicolon
  const firstLine = lines[0]
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ','
  const headers = parseCsvLine(lines[0], delimiter).map((h) => h.trim().toLowerCase())
  const idx = (key: string) => headers.indexOf(key)
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line, delimiter)
    const get = (key: string) => (cols[idx(key)] ?? '').trim()
    const truthy = (v: string) => v.toLowerCase() === 'true' || v === '1' || v.toLowerCase() === 'yes'
    return {
      name: get('name'),
      sku: get('sku'),
      barcode: get('barcode'),
      description: get('description'),
      category: get('category'),
      unit: get('unit'),
      costPrice: get('costprice'),
      sellingPrice: get('sellingprice'),
      taxRate: get('taxrate'),
      isTaxable: truthy(get('istaxable') || 'true'),
      minStockLevel: get('minstocklevel'),
      allowDecimalQuantity: truthy(get('allowdecimalquantity')),
    }
  })
}

function downloadXlsxTemplate(): void {
  const exampleRow = {
    name: 'Sample Product',
    sku: 'SKU-001',
    barcode: '1234567890',
    description: 'A sample description',
    category: 'Beverages',
    unit: 'Piece',
    costPrice: 50,
    sellingPrice: 100,
    taxRate: 10,
    isTaxable: 'true',
    minStockLevel: 5,
    allowDecimalQuantity: 'false',
  }
  const ws = XLSX.utils.json_to_sheet([exampleRow], { header: [...CSV_TEMPLATE_HEADERS] })
  // Style header row bold (column widths for readability)
  ws['!cols'] = CSV_TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 4, 14) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Products')
  XLSX.writeFile(wb, 'products-import-template.xlsx')
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

function isProductEnabled(product: ProductResponse): boolean {
  return product.isActive ?? product.active ?? false
}

function isCategoryEnabled(category: ProductCategory): boolean {
  return category.isActive ?? category.active ?? false
}

function isUnitEnabled(unit: ProductUnit): boolean {
  return unit.isActive ?? unit.active ?? false
}

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const parsePositiveInt = (value: string | null, fallback: number): number => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
  }
  const parseSortDir = (value: string | null, fallback: 'asc' | 'desc'): 'asc' | 'desc' =>
    value === 'asc' || value === 'desc' ? value : fallback
  const parseStatus = (
    value: string | null,
    fallback: 'all' | 'active' | 'inactive',
  ): 'all' | 'active' | 'inactive' =>
    value === 'all' || value === 'active' || value === 'inactive' ? value : fallback

  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [products, setProducts] = useState<ProductResponse[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [units, setUnits] = useState<ProductUnit[]>([])
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('categoryId') ?? '')
  const [page, setPage] = useState(parsePositiveInt(searchParams.get('page'), 0))
  const [size, setSize] = useState(parsePositiveInt(searchParams.get('size'), 20))
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') ?? 'updatedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(parseSortDir(searchParams.get('sortDir'), 'desc'))
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(
    parseStatus(searchParams.get('status'), 'active'),
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const { pushToast } = useToast()

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState({
    name: '',
    categoryId: '',
    unitId: '',
    sku: '',
    barcode: '',
    description: '',
    imageUrl: '',
    costPrice: '',
    sellingPrice: '',
    taxRate: '',
    minStockLevel: '',
    isTaxable: true,
    allowDecimalQuantity: false,
  })
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const [variantModalOpen, setVariantModalOpen] = useState(false)
  const [variantProduct, setVariantProduct] = useState<ProductResponse | null>(null)
  const [variants, setVariants] = useState<ProductVariantResponse[]>([])
  const [variantsLoading, setVariantsLoading] = useState(false)
  const [variantForm, setVariantForm] = useState({ name: '', sku: '', barcode: '', costPrice: '', sellingPrice: '', attributes: '' })
  const [variantSubmitting, setVariantSubmitting] = useState(false)
  const [variantError, setVariantError] = useState<string | null>(null)
  const [editVariantId, setEditVariantId] = useState<string | null>(null)

  const openVariantModal = async (product: ProductResponse) => {
    setVariantProduct(product)
    setVariantForm({ name: '', sku: '', barcode: '', costPrice: '', sellingPrice: '', attributes: '' })
    setVariantError(null)
    setEditVariantId(null)
    setVariantModalOpen(true)
    setVariantsLoading(true)
    try {
      const list = await fetchVariants(product.id)
      setVariants(list)
    } catch {
      setVariants([])
    } finally {
      setVariantsLoading(false)
    }
  }

  const submitVariant = async () => {
    if (!variantProduct) return
    if (!variantForm.name.trim()) { setVariantError('Variant name is required.'); return }
    setVariantSubmitting(true)
    setVariantError(null)
    try {
      let attributes: Record<string, string> | undefined
      if (variantForm.attributes.trim()) {
        try { attributes = JSON.parse(variantForm.attributes) } catch { attributes = undefined }
      }
      const payload: CreateVariantRequest = {
        name: variantForm.name.trim(),
        sku: variantForm.sku.trim() || undefined,
        barcode: variantForm.barcode.trim() || undefined,
        costPrice: variantForm.costPrice.trim() ? Number(variantForm.costPrice) : undefined,
        sellingPrice: variantForm.sellingPrice.trim() ? Number(variantForm.sellingPrice) : undefined,
        attributes,
      }
      if (editVariantId) {
        const updated = await updateVariant(variantProduct.id, editVariantId, payload)
        setVariants((prev) => prev.map((v) => (v.id === editVariantId ? updated : v)))
      } else {
        const created = await createVariant(variantProduct.id, payload)
        setVariants((prev) => [...prev, created])
      }
      setVariantForm({ name: '', sku: '', barcode: '', costPrice: '', sellingPrice: '', attributes: '' })
      setEditVariantId(null)
      pushToast('success', editVariantId ? 'Variant updated.' : 'Variant created.')
    } catch (err) {
      setVariantError(err instanceof Error ? err.message : 'Failed to save variant')
    } finally {
      setVariantSubmitting(false)
    }
  }

  const handleDeactivateVariant = async (variantId: string) => {
    if (!variantProduct) return
    try {
      await deactivateVariant(variantProduct.id, variantId)
      setVariants((prev) => prev.filter((v) => v.id !== variantId))
      pushToast('success', 'Variant removed.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to remove variant')
    }
  }

  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importSubmitting, setImportSubmitting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importDone, setImportDone] = useState(false)
  const [importSummary, setImportSummary] = useState({ created: 0, failed: 0 })
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editProductId, setEditProductId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    categoryId: '',
    unitId: '',
    sku: '',
    barcode: '',
    description: '',
    imageUrl: '',
    costPrice: '',
    sellingPrice: '',
    taxRate: '',
    minStockLevel: '',
    isTaxable: true,
    allowDecimalQuantity: false,
    isActive: true,
  })

  useEffect(() => {
    const next = new URLSearchParams()
    if (search) next.set('q', search)
    if (categoryFilter) next.set('categoryId', categoryFilter)
    if (statusFilter !== 'active') next.set('status', statusFilter)
    if (sortBy !== 'updatedAt') next.set('sortBy', sortBy)
    if (sortDir !== 'desc') next.set('sortDir', sortDir)
    if (page !== 0) next.set('page', String(page))
    if (size !== 20) next.set('size', String(size))
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [categoryFilter, page, search, searchParams, setSearchParams, size, sortBy, sortDir, statusFilter])

  useEffect(() => {
    let cancelled = false
    const timeout = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const [response, categoryRows, unitRows] = await Promise.all([
          fetchProducts({
            search,
            categoryId: categoryFilter || undefined,
            isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
            page,
            size,
            sortBy,
            sortDir,
          }),
          fetchCategories(),
          fetchUnits(),
        ])
        if (!cancelled) {
          setProducts(response.content)
          setTotalPages(response.totalPages)
          setTotalElements(response.totalElements)
          setCategories(categoryRows)
          setUnits(unitRows)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load products')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [categoryFilter, page, refreshKey, search, size, sortBy, sortDir, statusFilter])

  const activeCategories = categories.filter((row) => isCategoryEnabled(row))
  const activeUnits = units.filter((row) => isUnitEnabled(row))

  const resetCreateForm = () => {
    setCreateForm({
      name: '',
      categoryId: '',
      unitId: '',
      sku: '',
      barcode: '',
      description: '',
      imageUrl: '',
      costPrice: '',
      sellingPrice: '',
      taxRate: '',
      minStockLevel: '',
      isTaxable: true,
      allowDecimalQuantity: false,
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

  const submitCreateProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateError(null)

    if (!createForm.name.trim()) {
      setCreateError('Product name is required.')
      pushToast('error', 'Product name is required.')
      return
    }
    const sellingPrice = Number(createForm.sellingPrice)
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      setCreateError('Selling price must be a valid number.')
      pushToast('error', 'Selling price must be a valid number.')
      return
    }
    const costPrice =
      createForm.costPrice.trim() === '' ? undefined : Number(createForm.costPrice)
    if (costPrice !== undefined && (!Number.isFinite(costPrice) || costPrice < 0)) {
      setCreateError('Cost price must be a valid number.')
      pushToast('error', 'Cost price must be a valid number.')
      return
    }

    setCreateSubmitting(true)
    try {
      const taxRate = createForm.taxRate.trim() === '' ? undefined : Number(createForm.taxRate)
      const minStockLevel = createForm.minStockLevel.trim() === '' ? undefined : Number(createForm.minStockLevel)
      await createProduct({
        name: createForm.name.trim(),
        categoryId: createForm.categoryId || undefined,
        unitId: createForm.unitId || undefined,
        sku: createForm.sku.trim() || undefined,
        barcode: createForm.barcode.trim() || undefined,
        description: createForm.description.trim() || undefined,
        imageUrl: createForm.imageUrl.trim() || undefined,
        sellingPrice,
        costPrice,
        taxRate,
        minStockLevel,
        isTaxable: createForm.isTaxable,
        allowDecimalQuantity: createForm.allowDecimalQuantity,
      })
      setCreateModalOpen(false)
      setStatusFilter('active')
      setPage(0)
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Product created successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create product'
      setCreateError(message)
      pushToast('error', message)
    } finally {
      setCreateSubmitting(false)
    }
  }

  const handleCreateImageChange = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setCreateError('Please choose a valid image file.')
      pushToast('error', 'Please choose a valid image file.')
      return
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setCreateError('Image must be 2MB or smaller.')
      pushToast('error', 'Image must be 2MB or smaller.')
      return
    }
    try {
      const imageDataUrl = await fileToDataUrl(file)
      setCreateForm((prev) => ({ ...prev, imageUrl: imageDataUrl }))
      setCreateError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process image.'
      setCreateError(message)
      pushToast('error', message)
    }
  }

  const openEditModal = (product: ProductResponse) => {
    setEditProductId(product.id)
    setEditForm({
      name: product.name ?? '',
      categoryId: product.categoryId ?? '',
      unitId: product.unitId ?? '',
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      description: product.description ?? '',
      imageUrl: product.imageUrl ?? '',
      costPrice: product.costPrice == null ? '' : String(product.costPrice),
      sellingPrice: String(product.sellingPrice ?? 0),
      taxRate: product.taxRate == null ? '' : String(product.taxRate),
      minStockLevel: product.minStockLevel == null ? '' : String(product.minStockLevel),
      isTaxable: product.isTaxable ?? product.taxable ?? true,
      allowDecimalQuantity: product.allowDecimalQuantity ?? false,
      isActive: product.isActive ?? product.active ?? true,
    })
    setEditError(null)
    setEditModalOpen(true)
  }

  const closeEditModal = () => {
    if (editSubmitting) return
    setEditModalOpen(false)
    setEditError(null)
    setEditProductId(null)
  }

  const submitEditProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEditError(null)
    if (!editProductId) return

    if (!editForm.name.trim()) {
      setEditError('Product name is required.')
      pushToast('error', 'Product name is required.')
      return
    }
    const sellingPrice = Number(editForm.sellingPrice)
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      setEditError('Selling price must be a valid number.')
      pushToast('error', 'Selling price must be a valid number.')
      return
    }
    const costPrice = editForm.costPrice.trim() === '' ? undefined : Number(editForm.costPrice)
    if (costPrice !== undefined && (!Number.isFinite(costPrice) || costPrice < 0)) {
      setEditError('Cost price must be a valid number.')
      pushToast('error', 'Cost price must be a valid number.')
      return
    }

    setEditSubmitting(true)
    try {
      const sku = editForm.sku.trim()
      const barcode = editForm.barcode.trim()
      const editTaxRate = editForm.taxRate.trim() === '' ? undefined : Number(editForm.taxRate)
      const editMinStockLevel = editForm.minStockLevel.trim() === '' ? undefined : Number(editForm.minStockLevel)
      await updateProduct(editProductId, {
        name: editForm.name.trim(),
        categoryId: editForm.categoryId || undefined,
        clearCategoryId: editForm.categoryId ? undefined : true,
        unitId: editForm.unitId || undefined,
        clearUnitId: editForm.unitId ? undefined : true,
        sku: sku || undefined,
        clearSku: sku ? undefined : true,
        barcode: barcode || undefined,
        clearBarcode: barcode ? undefined : true,
        description: editForm.description.trim() || undefined,
        imageUrl: editForm.imageUrl.trim() || undefined,
        sellingPrice,
        costPrice,
        taxRate: editTaxRate,
        minStockLevel: editMinStockLevel,
        isTaxable: editForm.isTaxable,
        allowDecimalQuantity: editForm.allowDecimalQuantity,
        isActive: editForm.isActive,
      })
      setEditModalOpen(false)
      setEditProductId(null)
      setRefreshKey((value) => value + 1)
      pushToast('success', 'Product updated successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update product'
      setEditError(message)
      pushToast('error', message)
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleEditImageChange = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setEditError('Please choose a valid image file.')
      pushToast('error', 'Please choose a valid image file.')
      return
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setEditError('Image must be 2MB or smaller.')
      pushToast('error', 'Image must be 2MB or smaller.')
      return
    }
    try {
      const imageDataUrl = await fileToDataUrl(file)
      setEditForm((prev) => ({ ...prev, imageUrl: imageDataUrl }))
      setEditError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process image.'
      setEditError(message)
      pushToast('error', message)
    }
  }

  const openImportModal = () => {
    setImportRows([])
    setImportProgress(0)
    setImportDone(false)
    setImportSummary({ created: 0, failed: 0 })
    setImportModalOpen(true)
  }

  const closeImportModal = () => {
    if (importSubmitting) return
    setImportModalOpen(false)
    if (importDone && importSummary.created > 0) {
      setRefreshKey((v) => v + 1)
    }
  }

  const validateImportRows = (rows: ImportRow[]): ImportRow[] =>
    rows.map((row) => {
      if (!row.name.trim()) return { ...row, _error: 'Name is required' }
      const sp = Number(row.sellingPrice)
      if (!Number.isFinite(sp) || sp < 0) return { ...row, _error: 'Invalid selling price' }
      if (row.costPrice && (!Number.isFinite(Number(row.costPrice)) || Number(row.costPrice) < 0))
        return { ...row, _error: 'Invalid cost price' }
      return row
    })

  const handleImportFile = (file: File | undefined) => {
    if (!file) return
    const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    const reader = new FileReader()

    if (isXlsx) {
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        const truthy = (v: unknown) => {
          const s = String(v ?? '').toLowerCase()
          return s === 'true' || s === '1' || s === 'yes'
        }
        const rows: ImportRow[] = json.map((row) => ({
          name: String(row['name'] ?? '').trim(),
          sku: String(row['sku'] ?? '').trim(),
          barcode: String(row['barcode'] ?? '').trim(),
          description: String(row['description'] ?? '').trim(),
          category: String(row['category'] ?? '').trim(),
          unit: String(row['unit'] ?? '').trim(),
          costPrice: String(row['costPrice'] ?? '').trim(),
          sellingPrice: String(row['sellingPrice'] ?? '').trim(),
          taxRate: String(row['taxRate'] ?? '').trim(),
          isTaxable: truthy(row['isTaxable'] ?? 'true'),
          minStockLevel: String(row['minStockLevel'] ?? '').trim(),
          allowDecimalQuantity: truthy(row['allowDecimalQuantity']),
        }))
        setImportRows(validateImportRows(rows))
        setImportProgress(0)
        setImportDone(false)
        setImportSummary({ created: 0, failed: 0 })
      }
      reader.readAsArrayBuffer(file)
    } else {
      reader.onload = () => {
        const text = String(reader.result ?? '')
        const rows = parseCsvText(text)
        setImportRows(validateImportRows(rows))
        setImportProgress(0)
        setImportDone(false)
        setImportSummary({ created: 0, failed: 0 })
      }
      reader.readAsText(file)
    }
  }

  const runImport = async () => {
    setImportSubmitting(true)
    setImportProgress(0)
    let created = 0
    let failed = 0
    const updated: ImportRow[] = []
    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i]
      if (row._error) {
        updated.push(row)
        failed++
        setImportProgress(i + 1)
        continue
      }
      const categoryMatch = activeCategories.find(
        (c) => c.name.trim().toLowerCase() === row.category.trim().toLowerCase(),
      )
      const unitMatch = activeUnits.find(
        (u) => u.name.trim().toLowerCase() === row.unit.trim().toLowerCase(),
      )
      try {
        await createProduct({
          name: row.name.trim(),
          sku: row.sku || undefined,
          barcode: row.barcode || undefined,
          description: row.description || undefined,
          categoryId: categoryMatch?.id,
          unitId: unitMatch?.id,
          costPrice: row.costPrice ? Number(row.costPrice) : undefined,
          sellingPrice: Number(row.sellingPrice),
          taxRate: row.taxRate ? Number(row.taxRate) : undefined,
          isTaxable: row.isTaxable,
          minStockLevel: row.minStockLevel ? Number(row.minStockLevel) : undefined,
          allowDecimalQuantity: row.allowDecimalQuantity,
        })
        updated.push({ ...row, _error: undefined })
        created++
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed'
        updated.push({ ...row, _error: msg })
        failed++
      }
      setImportProgress(i + 1)
    }
    setImportRows(updated)
    setImportSummary({ created, failed })
    setImportDone(true)
    setImportSubmitting(false)
    if (created > 0) {
      pushToast('success', `Imported ${created} product${created !== 1 ? 's' : ''}.`)
    }
    if (failed > 0) {
      pushToast('error', `${failed} row${failed !== 1 ? 's' : ''} failed — see table for details.`)
    }
  }

  const handleDeactivate = (product: ProductResponse) => {
    const isActive = isProductEnabled(product)
    const action = isActive ? 'Deactivate' : 'Reactivate'
    setConfirmState({
      title: `${action} product`,
      message: `${action} product "${product.name}"?`,
      confirmLabel: action,
      destructive: isActive,
      onConfirm: async () => {
        try {
          if (isActive) {
            await deactivateProduct(product.id)
          } else {
            await updateProduct(product.id, { isActive: true })
          }
          setRefreshKey((value) => value + 1)
          pushToast('success', `Product "${product.name}" ${isActive ? 'deactivated' : 'reactivated'}.`)
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : `Failed to ${action.toLowerCase()} product`)
        }
        setConfirmState(null)
      },
    })
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Catalog</p>
          <h2 className="font-display text-xl text-slate-900">Products</h2>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <button
            type="button"
            onClick={openImportModal}
            className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Import CSV
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Add Product
          </button>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-full sm:grid-cols-5">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(0)
            }}
            placeholder="Search by name, SKU, barcode"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-emerald-400 focus:ring sm:w-80"
          />
          <select
            aria-label="Status filter"
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
            aria-label="Category filter"
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort by"
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value)
              setPage(0)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="updatedAt">Updated At</option>
            <option value="name">Name</option>
            <option value="sellingPrice">Selling Price</option>
            <option value="createdAt">Created At</option>
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
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading products...</p> : null}

      {!loading && !error ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">SKU</th>
                  <th className="px-2 py-2 font-medium">Category</th>
                  <th className="px-2 py-2 font-medium">Unit</th>
                  <th className="px-2 py-2 font-medium">Selling Price</th>
                  <th className="px-2 py-2 font-medium">Taxable</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-slate-100">
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="h-9 w-9 rounded-md border border-slate-200 object-cover"
                          />
                        ) : (
                          <div className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-slate-100 text-[0.65rem] font-semibold text-slate-500">
                            IMG
                          </div>
                        )}
                        <span className="font-medium text-slate-800">{product.name}</span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-slate-600">{product.sku || '-'}</td>
                    <td className="px-2 py-3 text-slate-600">{product.categoryName || '-'}</td>
                    <td className="px-2 py-3 text-slate-600">
                      {product.unitAbbreviation || product.unitName || '-'}
                    </td>
                    <td className="px-2 py-3 text-slate-700">{formatCurrency(product.sellingPrice)}</td>
                    <td className="px-2 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          product.isTaxable ?? product.taxable
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {product.isTaxable ?? product.taxable ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          isProductEnabled(product) ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isProductEnabled(product) ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(product)}
                          className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openVariantModal(product)}
                          className="rounded-lg border border-sky-200 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                        >
                          Variants
                          {product.variants && product.variants.length > 0 && (
                            <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-xs text-sky-800">
                              {product.variants.length}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeactivate(product)}
                          className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                            isProductEnabled(product)
                              ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {isProductEnabled(product) ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-slate-600">
              Total: {totalElements} | Page {totalPages === 0 ? 0 : page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <select
                aria-label="Rows per page"
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

      {createModalOpen ? (
        <Modal title="Create Product" onClose={closeCreateModal}>
          <form className="space-y-3" onSubmit={submitCreateProduct}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Product name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                aria-label="Category"
                value={createForm.categoryId}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">No category</option>
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Unit"
                value={createForm.unitId}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, unitId: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">No unit</option>
                {activeUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} ({unit.abbreviation})
                  </option>
                ))}
              </select>
              <input
                value={createForm.sellingPrice}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, sellingPrice: event.target.value }))}
                type="number"
                step="0.01"
                min="0"
                placeholder="Selling price *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
                <input
                  value={createForm.sku}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, sku: event.target.value }))}
                  placeholder="SKU"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  value={createForm.barcode}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, barcode: event.target.value }))}
                  placeholder="Barcode"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <label className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Product image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      void handleCreateImageChange(event.target.files?.[0])
                      event.currentTarget.value = ''
                    }}
                    className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-emerald-200 file:bg-emerald-50 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100"
                  />
                </label>
                <input
                  value={createForm.costPrice}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, costPrice: event.target.value }))}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Cost price"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  value={createForm.taxRate}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, taxRate: event.target.value }))}
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="Tax rate % (e.g. 18)"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  value={createForm.minStockLevel}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, minStockLevel: event.target.value }))}
                  type="number"
                  step="1"
                  min="0"
                  placeholder="Min stock level"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <textarea
                value={createForm.description}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Description (optional)"
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              {createForm.imageUrl ? (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <img
                    src={createForm.imageUrl}
                    alt="Create product preview"
                    className="h-14 w-14 rounded-md border border-slate-200 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setCreateForm((prev) => ({ ...prev, imageUrl: '' }))}
                    className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    Remove image
                  </button>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={createForm.isTaxable}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, isTaxable: event.target.checked }))
                    }
                  />
                  Taxable
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={createForm.allowDecimalQuantity}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, allowDecimalQuantity: event.target.checked }))
                    }
                  />
                  Allow decimal qty
                </label>
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
                  {createSubmitting ? 'Creating...' : 'Create Product'}
                </button>
              </div>
            </form>
        </Modal>
      ) : null}

      {importModalOpen ? (
        <Modal title="Import Products from CSV" onClose={closeImportModal} maxWidthClass="max-w-4xl">
          <div className="space-y-4">
            {/* Step 1 — File picker */}
            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {importRows.length > 0 ? 'Change file' : 'Choose CSV file'}
                <input
                  type="file"
                  accept=".xlsx,.csv,.tsv"
                  className="sr-only"
                  disabled={importSubmitting}
                  onChange={(e) => {
                    handleImportFile(e.target.files?.[0])
                    e.currentTarget.value = ''
                  }}
                />
              </label>
              <button
                type="button"
                onClick={downloadXlsxTemplate}
                className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                Download Template
              </button>
              <p className="text-xs text-slate-500">
                Download the template → fill in Excel → upload the .xlsx directly, or save as CSV.
              </p>
            </div>

            {/* Progress bar */}
            {importSubmitting ? (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                  <span>Importing…</span>
                  <span>{importProgress} / {importRows.length}</span>
                </div>
                <progress
                  value={importProgress}
                  max={importRows.length || 1}
                  className="h-2 w-full rounded-full accent-emerald-500"
                />
              </div>
            ) : null}

            {/* Done summary */}
            {importDone ? (
              <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${importSummary.failed === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                Import complete — {importSummary.created} created, {importSummary.failed} failed.
                {importSummary.failed > 0 ? ' Rows with errors are highlighted below.' : ''}
              </div>
            ) : null}

            {/* Preview table */}
            {importRows.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">#</th>
                      <th className="px-2 py-2 font-medium">Name</th>
                      <th className="px-2 py-2 font-medium">SKU</th>
                      <th className="px-2 py-2 font-medium">Category</th>
                      <th className="px-2 py-2 font-medium">Unit</th>
                      <th className="px-2 py-2 font-medium">Cost</th>
                      <th className="px-2 py-2 font-medium">Sell Price</th>
                      <th className="px-2 py-2 font-medium">Taxable</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => (
                      <tr key={i} className={`border-b border-slate-100 ${row._error ? 'bg-rose-50' : ''}`}>
                        <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                        <td className="px-2 py-2 font-medium text-slate-800">{row.name || '—'}</td>
                        <td className="px-2 py-2 text-slate-600">{row.sku || '—'}</td>
                        <td className="px-2 py-2 text-slate-600">
                          {row.category
                            ? activeCategories.find((c) => c.name.toLowerCase() === row.category.toLowerCase())
                              ? row.category
                              : <span className="text-amber-700">{row.category} (not found)</span>
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-slate-600">
                          {row.unit
                            ? activeUnits.find((u) => u.name.toLowerCase() === row.unit.toLowerCase())
                              ? row.unit
                              : <span className="text-amber-700">{row.unit} (not found)</span>
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-slate-600">{row.costPrice || '—'}</td>
                        <td className="px-2 py-2 text-slate-700">{row.sellingPrice}</td>
                        <td className="px-2 py-2 text-slate-600">{row.isTaxable ? 'Yes' : 'No'}</td>
                        <td className="px-2 py-2">
                          {row._error ? (
                            <span className="text-rose-700">{row._error}</span>
                          ) : importDone ? (
                            <span className="text-emerald-700">Imported</span>
                          ) : (
                            <span className="text-slate-400">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No file selected. Choose a CSV file or download the template above.</p>
            )}

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {importRows.length > 0 ? `${importRows.filter((r) => !r._error).length} valid / ${importRows.length} total rows` : ''}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeImportModal}
                  disabled={importSubmitting}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {importDone ? 'Close' : 'Cancel'}
                </button>
                {!importDone ? (
                  <button
                    type="button"
                    onClick={() => void runImport()}
                    disabled={importSubmitting || importRows.filter((r) => !r._error).length === 0}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {importSubmitting
                      ? `Importing ${importProgress}/${importRows.length}…`
                      : `Import ${importRows.filter((r) => !r._error).length} Product${importRows.filter((r) => !r._error).length !== 1 ? 's' : ''}`}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {confirmState ? (
        <ConfirmModal
          {...confirmState}
          onClose={() => setConfirmState(null)}
        />
      ) : null}

      {editModalOpen ? (
        <Modal title="Edit Product" onClose={closeEditModal}>
          <form className="space-y-3" onSubmit={submitEditProduct}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={editForm.name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Product name *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                aria-label="Category"
                value={editForm.categoryId}
                onChange={(event) => setEditForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">No category</option>
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Unit"
                value={editForm.unitId}
                onChange={(event) => setEditForm((prev) => ({ ...prev, unitId: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">No unit</option>
                {activeUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} ({unit.abbreviation})
                  </option>
                ))}
              </select>
              <input
                value={editForm.sellingPrice}
                onChange={(event) => setEditForm((prev) => ({ ...prev, sellingPrice: event.target.value }))}
                type="number"
                step="0.01"
                min="0"
                placeholder="Selling price *"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editForm.sku}
                onChange={(event) => setEditForm((prev) => ({ ...prev, sku: event.target.value }))}
                placeholder="SKU"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editForm.barcode}
                onChange={(event) => setEditForm((prev) => ({ ...prev, barcode: event.target.value }))}
                placeholder="Barcode"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <label className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <span className="mb-1 block text-xs font-medium text-slate-500">Product image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    void handleEditImageChange(event.target.files?.[0])
                    event.currentTarget.value = ''
                  }}
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-emerald-200 file:bg-emerald-50 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100"
                />
              </label>
              <input
                value={editForm.costPrice}
                onChange={(event) => setEditForm((prev) => ({ ...prev, costPrice: event.target.value }))}
                type="number"
                step="0.01"
                min="0"
                placeholder="Cost price"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editForm.taxRate}
                onChange={(event) => setEditForm((prev) => ({ ...prev, taxRate: event.target.value }))}
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="Tax rate % (e.g. 18)"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editForm.minStockLevel}
                onChange={(event) => setEditForm((prev) => ({ ...prev, minStockLevel: event.target.value }))}
                type="number"
                step="1"
                min="0"
                placeholder="Min stock level"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <textarea
              value={editForm.description}
              onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            {editForm.imageUrl ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <img
                  src={editForm.imageUrl}
                  alt="Edit product preview"
                  className="h-14 w-14 rounded-md border border-slate-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setEditForm((prev) => ({ ...prev, imageUrl: '' }))}
                  className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Remove image
                </button>
              </div>
            ) : null}
            <div className="grid grid-cols-3 gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editForm.isTaxable}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, isTaxable: event.target.checked }))}
                />
                Taxable
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editForm.allowDecimalQuantity}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, allowDecimalQuantity: event.target.checked }))}
                />
                Decimal qty
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
                Active
              </label>
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

      {variantModalOpen && variantProduct ? (
        <Modal
          title={`Variants — ${variantProduct.name}`}
          onClose={() => { setVariantModalOpen(false); setVariantProduct(null); setVariants([]) }}
        >
          <div className="space-y-4">
            {/* Existing variants list */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Existing Variants</p>
              {variantsLoading ? (
                <p className="text-sm text-slate-500">Loading variants...</p>
              ) : variants.length === 0 ? (
                <p className="text-sm text-slate-400">No variants yet.</p>
              ) : (
                <div className="space-y-2">
                  {variants.map((v) => (
                    <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{v.name}</p>
                        <p className="text-xs text-slate-500">
                          {v.sku ? `SKU: ${v.sku}` : ''}
                          {v.sellingPrice != null ? ` · ${formatCurrency(v.sellingPrice)}` : ''}
                          {v.attributes && Object.keys(v.attributes).length > 0
                            ? ` · ${Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(', ')}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditVariantId(v.id)
                            setVariantForm({
                              name: v.name,
                              sku: v.sku ?? '',
                              barcode: v.barcode ?? '',
                              costPrice: v.costPrice != null ? String(v.costPrice) : '',
                              sellingPrice: v.sellingPrice != null ? String(v.sellingPrice) : '',
                              attributes: v.attributes ? JSON.stringify(v.attributes) : '',
                            })
                          }}
                          className="rounded border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeactivateVariant(v.id)}
                          className="rounded border border-rose-200 px-2 py-0.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add / Edit variant form */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {editVariantId ? 'Edit Variant' : 'Add Variant'}
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input
                  placeholder="Variant name * (e.g. Medium Blue)"
                  value={variantForm.name}
                  onChange={(e) => setVariantForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  placeholder="SKU (optional)"
                  value={variantForm.sku}
                  onChange={(e) => setVariantForm((prev) => ({ ...prev, sku: e.target.value }))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  placeholder="Barcode (optional)"
                  value={variantForm.barcode}
                  onChange={(e) => setVariantForm((prev) => ({ ...prev, barcode: e.target.value }))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  placeholder={`Selling price (default: ${formatCurrency(variantProduct.sellingPrice)})`}
                  type="number"
                  value={variantForm.sellingPrice}
                  onChange={(e) => setVariantForm((prev) => ({ ...prev, sellingPrice: e.target.value }))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  placeholder={`Cost price (default: ${formatCurrency(variantProduct.costPrice ?? 0)})`}
                  type="number"
                  value={variantForm.costPrice}
                  onChange={(e) => setVariantForm((prev) => ({ ...prev, costPrice: e.target.value }))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  placeholder='Attributes JSON, e.g. {"Size":"M","Color":"Blue"}'
                  value={variantForm.attributes}
                  onChange={(e) => setVariantForm((prev) => ({ ...prev, attributes: e.target.value }))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              {variantError && <p className="mt-1 text-xs text-rose-600">{variantError}</p>}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={variantSubmitting}
                  onClick={() => void submitVariant()}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {variantSubmitting ? 'Saving...' : editVariantId ? 'Update Variant' : 'Add Variant'}
                </button>
                {editVariantId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditVariantId(null)
                      setVariantForm({ name: '', sku: '', barcode: '', costPrice: '', sellingPrice: '', attributes: '' })
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}
