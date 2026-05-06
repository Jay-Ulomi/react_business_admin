import { createBrowserRouter, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider } from '../features/auth/auth-context'
import { ProtectedRoute, PublicOnlyRoute } from '../features/auth/route-guards'
import { BusinessProvider, useBusinessContext } from '../features/context/business-context'
import { ToastProvider } from '../features/ui/toast-context'
import { AppShell } from '../layout/app-shell'
import { DashboardPage } from '../pages/dashboard-page'
import { LoginPage } from '../pages/login-page'
import { ProductsPage } from '../pages/products-page'
import { CategoriesPage } from '../pages/categories-page'
import { UnitsPage } from '../pages/units-page'
import { InventoryPage } from '../pages/inventory-page'
import { StockCountsPage } from '../pages/stock-counts-page'
import { TransfersPage } from '../pages/transfers-page'
import { PurchasesPage } from '../pages/purchases-page'
import { SalesPage } from '../pages/sales-page'
import { LaundryOrdersPage } from '../pages/laundry-orders-page'
import { LaundryStockAuditPage } from '../pages/laundry-stock-audit-page'
import { ExpensesPage } from '../pages/expenses-page'
import { CustomersPage } from '../pages/customers-page'
import { CustomerGroupsPage } from '../pages/customer-groups-page'
import { ReportsPage } from '../pages/reports-page'
import { SettingsPage } from '../pages/settings-page'
import { ChartOfAccountsPage } from '../pages/chart-of-accounts-page'
import { JournalEntriesPage } from '../pages/journal-entries-page'
import { TrialBalancePage } from '../pages/trial-balance-page'
import { ProfitLossPage } from '../pages/profit-loss-page'
import { BalanceSheetPage } from '../pages/balance-sheet-page'
import { TaxRulesPage } from '../pages/tax-rules-page'
import { ReconciliationPage } from '../pages/reconciliation-page'
import { PayablesPage } from '../pages/payables-page'
import { ReceivablesPage } from '../pages/receivables-page'
import { FiscalPeriodsPage } from '../pages/fiscal-periods-page'
import { BillingPage } from '../pages/billing-page'
import { PromotionsPage } from '../pages/promotions-page'
import { GiftCardsPage } from '../pages/gift-cards-page'
import { SerialLotsPage } from '../pages/serial-lots-page'

function LaundryRoute() {
  const { selectedContext } = useBusinessContext()
  const isLaundryBusiness = (selectedContext?.businessType ?? '').toUpperCase() === 'LAUNDRY'
  if (!isLaundryBusiness) {
    return <Navigate to="/app/dashboard" replace />
  }
  return <LaundryOrdersPage />
}

function LaundryOnlyRoute({ children }: { children: ReactNode }) {
  const { selectedContext } = useBusinessContext()
  const isLaundryBusiness = (selectedContext?.businessType ?? '').toUpperCase() === 'LAUNDRY'
  if (!isLaundryBusiness) {
    return <Navigate to="/app/dashboard" replace />
  }
  return <>{children}</>
}

function NonLaundryRoute({ children }: { children: ReactNode }) {
  const { selectedContext } = useBusinessContext()
  const isLaundryBusiness = (selectedContext?.businessType ?? '').toUpperCase() === 'LAUNDRY'
  if (isLaundryBusiness) {
    return <Navigate to="/app/laundry/orders" replace />
  }
  return <>{children}</>
}

function SalesRoute() {
  const { selectedContext } = useBusinessContext()
  const isLaundryBusiness = (selectedContext?.businessType ?? '').toUpperCase() === 'LAUNDRY'
  if (isLaundryBusiness) {
    return <Navigate to="/app/laundry/orders" replace />
  }
  return <SalesPage />
}

function Providers() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BusinessProvider>
          <ProtectedRoute />
        </BusinessProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

function PublicProviders() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BusinessProvider>
          <PublicOnlyRoute />
        </BusinessProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

export const appRouter = createBrowserRouter(
  [
  {
    path: '/',
    element: <Navigate to="/app/dashboard" replace />,
  },
  {
    element: <PublicProviders />,
    children: [
      {
        path: '/login',
        element: <LoginPage />,
      },
    ],
  },
  {
    element: <Providers />,
    children: [
      {
        path: '/app',
        element: <AppShell />,
        children: [
          { path: '', element: <Navigate to="/app/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'units', element: <UnitsPage /> },
          { path: 'inventory', element: <NonLaundryRoute><InventoryPage /></NonLaundryRoute> },
          { path: 'stock-counts', element: <NonLaundryRoute><StockCountsPage /></NonLaundryRoute> },
          { path: 'stock-counts/:id', element: <NonLaundryRoute><StockCountsPage /></NonLaundryRoute> },
          { path: 'transfers', element: <NonLaundryRoute><TransfersPage /></NonLaundryRoute> },
          { path: 'transfers/:id', element: <NonLaundryRoute><TransfersPage /></NonLaundryRoute> },
          { path: 'purchases', element: <NonLaundryRoute><PurchasesPage /></NonLaundryRoute> },
          { path: 'sales', element: <SalesRoute /> },
          { path: 'laundry/orders', element: <LaundryRoute /> },
          { path: 'laundry/stock-audit', element: <LaundryOnlyRoute><LaundryStockAuditPage /></LaundryOnlyRoute> },
          { path: 'expenses', element: <ExpensesPage /> },
          { path: 'customers', element: <CustomersPage /> },
          { path: 'customer-groups', element: <CustomerGroupsPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'accounting/chart-of-accounts', element: <ChartOfAccountsPage /> },
          { path: 'accounting/journal-entries', element: <JournalEntriesPage /> },
          { path: 'accounting/trial-balance', element: <TrialBalancePage /> },
          { path: 'accounting/profit-loss', element: <ProfitLossPage /> },
          { path: 'accounting/balance-sheet', element: <BalanceSheetPage /> },
          { path: 'accounting/tax-rules', element: <TaxRulesPage /> },
          { path: 'accounting/reconciliation', element: <ReconciliationPage /> },
          { path: 'accounting/payables', element: <PayablesPage /> },
          { path: 'accounting/receivables', element: <ReceivablesPage /> },
          { path: 'accounting/fiscal-periods', element: <FiscalPeriodsPage /> },
          { path: 'billing', element: <BillingPage /> },
          { path: 'promotions', element: <PromotionsPage /> },
          { path: 'gift-cards', element: <GiftCardsPage /> },
          { path: 'serial-lots', element: <SerialLotsPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/app/dashboard" replace />,
  },
  ],
  { basename: import.meta.env.VITE_BASE_PATH ?? '/' },
)
