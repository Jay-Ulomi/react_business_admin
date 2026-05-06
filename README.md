# React Business Admin

Business owner/admin web app for the SaaS POS platform.

## Stack

- React 19 + TypeScript
- Vite 8
- Tailwind CSS v4
- React Router v7

## Setup

1. Install dependencies:
   - `npm install`
2. Configure API base URL:
   - `cp .env.example .env`
3. Run development server:
   - `npm run dev`

## Implemented Scope (Step 11)

- Tailwind CSS configured with Vite plugin.
- Auth flow wired to backend:
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/switch-context`
- Protected routing:
  - `/login`
  - `/app/dashboard`
  - `/app/products`
  - `/app/inventory`
  - `/app/purchases`
  - `/app/customers`
  - `/app/reports`
  - `/app/settings`
- Multi-business and branch context loader:
  - `GET /api/users/me/businesses`
  - `GET /api/businesses/{businessId}/branches`
- App shell with context switcher and logout.
- API-backed pages:
  - Products (search/status/sort/pagination)
  - Inventory snapshot
  - Purchases (status/date range/sort/pagination)
  - Customers via receivables endpoint (filters/sort/pagination)
  - Reports (daily sales, low stock, sales summary, branch performance)
  - Settings placeholder
- URL query persistence:
  - Products: `q,status,sortBy,sortDir,page,size`
  - Purchases: `status,from,to,sortBy,sortDir,page,size`
  - Customers: `customerId,sortBy,sortDir,page,size`
  - Reports: `date,start,end`
- Date presets:
  - `Today`, `Last 7 Days`, `This Month` for Purchases and Reports.

## Step 11 Status

- Step 11 is unblocked and implemented for current Business Admin scope.
- Remaining additions (advanced accounting/TRA screens and deeper settings forms) are follow-up scope items.

## Build

- `npm run build`
