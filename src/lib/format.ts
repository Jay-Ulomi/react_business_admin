const currencyFormatter = new Intl.NumberFormat('en-TZ', {
  style: 'currency',
  currency: 'TZS',
  maximumFractionDigits: 2,
})

export function formatCurrency(value: number | string | null | undefined): string {
  const numeric = Number(value ?? 0)
  if (Number.isNaN(numeric)) return 'TZS 0'
  return currencyFormatter.format(numeric)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}
