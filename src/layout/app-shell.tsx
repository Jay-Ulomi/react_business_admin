import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ContextSwitcher } from '../features/context/context-switcher'
import { useAuth } from '../features/auth/auth-context'
import { useBusinessContext } from '../features/context/business-context'

type NavItem = {
  to: string
  label: string
  short: string
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const navItems: NavItem[] = [
  { to: '/app/dashboard', label: 'Dashboard', short: 'DB' },
  { to: '/app/products', label: 'Products', short: 'PD' },
  { to: '/app/categories', label: 'Categories', short: 'CT' },
  { to: '/app/units', label: 'Units', short: 'UN' },
  { to: '/app/purchases', label: 'Purchases', short: 'PU' },
  { to: '/app/sales', label: 'Sales', short: 'SL' },
  { to: '/app/expenses', label: 'Expenses', short: 'EX' },
  { to: '/app/customers', label: 'Customers', short: 'CU' },
  { to: '/app/customer-groups', label: 'Customer Groups', short: 'CG' },
  { to: '/app/reports', label: 'Reports', short: 'RP' },
  { to: '/app/promotions', label: 'Promotions', short: 'PR' },
  { to: '/app/gift-cards', label: 'Gift Cards', short: 'GC' },
  { to: '/app/billing', label: 'Billing', short: 'BL' },
  { to: '/app/settings', label: 'Settings', short: 'ST' },
]

const inventoryGroup: NavGroup = {
  label: 'Inventory',
  items: [
    { to: '/app/inventory', label: 'Stock Overview', short: 'IV' },
    { to: '/app/stock-counts', label: 'Stock Count', short: 'SC' },
    { to: '/app/transfers', label: 'Transfers', short: 'TR' },
    { to: '/app/serial-lots', label: 'Serial & Lots', short: 'SL' },
  ],
}

const accountingGroup: NavGroup = {
  label: 'Accounting',
  items: [
    { to: '/app/accounting/chart-of-accounts', label: 'Chart of Accounts', short: 'CA' },
    { to: '/app/accounting/journal-entries', label: 'Journal Entries', short: 'JE' },
    { to: '/app/accounting/trial-balance', label: 'Trial Balance', short: 'TB' },
    { to: '/app/accounting/profit-loss', label: 'Profit & Loss', short: 'PL' },
    { to: '/app/accounting/balance-sheet', label: 'Balance Sheet', short: 'BS' },
    { to: '/app/accounting/tax-rules', label: 'Tax Rules', short: 'TX' },
    { to: '/app/accounting/fiscal-periods', label: 'Fiscal Periods', short: 'FP' },
    { to: '/app/accounting/reconciliation', label: 'Reconciliation', short: 'RC' },
    { to: '/app/accounting/payables', label: 'Payables', short: 'PY' },
    { to: '/app/accounting/receivables', label: 'Receivables', short: 'RV' },
  ],
}

type NavLinksProps = {
  isLaundryBusiness: boolean
  onNavigate?: () => void
}

function NavLinks({ isLaundryBusiness, onNavigate }: NavLinksProps) {
  const visibleNavItems = isLaundryBusiness
    ? [
        { to: '/app/dashboard', label: 'Dashboard', short: 'DB' },
        { to: '/app/laundry/orders', label: 'Tickets', short: 'TK' },
        { to: '/app/laundry/stock-audit', label: 'Stock Audit', short: 'SA' },
        { to: '/app/products', label: 'Products', short: 'PD' },
        { to: '/app/categories', label: 'Categories', short: 'CT' },
        { to: '/app/units', label: 'Units', short: 'UN' },
        { to: '/app/customers', label: 'Customers', short: 'CU' },
        { to: '/app/customer-groups', label: 'Customer Groups', short: 'CG' },
        { to: '/app/expenses', label: 'Expenses', short: 'EX' },
        { to: '/app/billing', label: 'Billing', short: 'BL' },
        { to: '/app/settings', label: 'Settings', short: 'ST' },
      ]
    : navItems
  return (
    <>
      {visibleNavItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
              isActive ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`
          }
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-black/10 text-xs">{item.short}</span>
          {item.label}
        </NavLink>
      ))}

      {!isLaundryBusiness ? (
        <div className="pt-3">
          <p className="px-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {inventoryGroup.label}
          </p>
          {inventoryGroup.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`
              }
            >
              <span className="grid h-7 w-7 place-items-center rounded-md bg-black/10 text-xs">{item.short}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      ) : null}

      <div className="pt-3">
        <p className="px-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {accountingGroup.label}
        </p>
        {accountingGroup.items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`
            }
          >
            <span className="grid h-7 w-7 place-items-center rounded-md bg-black/10 text-xs">{item.short}</span>
            {item.label}
          </NavLink>
        ))}
      </div>
    </>
  )
}

export function AppShell() {
  const { session, logout } = useAuth()
  const { selectedContext } = useBusinessContext()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const profileInitial = (session?.email?.trim().charAt(0) ?? 'U').toUpperCase()
  const isLaundryBusiness = (selectedContext?.businessType ?? '').toUpperCase() === 'LAUNDRY'

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex w-full flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            aria-label="Open navigation menu"
            onClick={() => setMobileNavOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-md border border-emerald-100 bg-white text-slate-700 hover:bg-emerald-50 md:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Business Admin</p>
            <h1 className="truncate text-lg font-semibold text-slate-900 md:text-xl">
              {selectedContext?.branchName ?? 'Select Branch'}
            </h1>
            <p className="truncate text-xs text-slate-500">{selectedContext?.businessName ?? 'No business selected'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <ContextSwitcher />
          <button
            type="button"
            aria-label="Notifications"
            className="relative grid h-9 w-9 place-items-center rounded-md border border-emerald-100 bg-white text-slate-600 hover:bg-emerald-50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
              <path d="M9 17a3 3 0 0 0 6 0" />
            </svg>
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-600" />
          </button>
          <button
            type="button"
            aria-label="Profile"
            className="hidden items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-left text-emerald-900 hover:bg-emerald-100 sm:flex"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full border border-emerald-200 bg-emerald-100 text-xs font-semibold text-emerald-800">
              {profileInitial}
            </span>
            <span className="max-w-[180px] truncate text-xs font-semibold">{session?.email ?? 'Profile'}</span>
          </button>
          <div className="grid h-9 w-9 place-items-center rounded-full border border-emerald-200 bg-emerald-100 text-xs font-semibold text-emerald-800 sm:hidden">
            {profileInitial}
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex w-full items-start gap-3 px-3 py-3 md:h-[calc(100vh-76px)] md:gap-4 md:overflow-hidden md:px-4 md:py-4">
        <aside className="hidden w-64 shrink-0 self-start rounded-2xl border border-emerald-100 bg-white/90 p-4 shadow-sm md:block md:h-full md:overflow-y-auto">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-emerald-700 text-sm font-semibold text-white">
              BA
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-700">Business Admin</p>
              <p className="text-xs text-slate-500">POS Control Center</p>
            </div>
          </div>

          <nav className="space-y-1.5">
            <NavLinks isLaundryBusiness={isLaundryBusiness} />
          </nav>
        </aside>

        <main className="min-w-0 flex-1 md:h-full md:overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          <aside className="relative h-full w-[85%] max-w-sm overflow-y-auto border-r border-emerald-100 bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-md bg-emerald-700 text-sm font-semibold text-white">
                  BA
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-700">Business Admin</p>
                  <p className="text-xs text-slate-500">Navigation</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileNavOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-md border border-emerald-100 bg-white text-slate-700 hover:bg-emerald-50"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <nav className="space-y-1.5">
              <NavLinks
                isLaundryBusiness={isLaundryBusiness}
                onNavigate={() => setMobileNavOpen(false)}
              />
            </nav>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
