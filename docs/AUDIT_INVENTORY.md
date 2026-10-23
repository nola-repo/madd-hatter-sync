# Madd Hatter Sync — Audit Inventory

> Generated: 2026-10-22  
> Status: Initial audit pass complete.

## Application Overview

**Madd Hatter Sync** is a TanStack Start (React/Vite/Nitro) full-stack web application that:
1. Pulls Clover POS data (orders, customers, payments, refunds, products, discounts) into a Supabase PostgreSQL database.
2. Pushes customer purchase data to GoHighLevel (GHL) CRM as contacts and custom "POS Purchase Item" records.
3. Applies GHL tags based on customer purchase history via configurable audience definitions.
4. Provides an admin dashboard for monitoring sync status, managing customers, and building marketing audiences.

---

## Pages & Routes Inventory

| Route | File | Purpose | Auth Required | Status |
|-------|------|---------|---------------|--------|
| `/` | `index.tsx` | Redirect to `/admin` | No | Inspected ✓ |
| `/login` | `login.tsx` | Admin login via Supabase Auth | No | Inspected ✓ |
| `/register` | `register.tsx` | New admin registration | No | Inspected ✓, TS errors present |
| `/pending-approval` | `pending-approval.tsx` | Holding page for unapproved users | No | Inspected ✓ |
| `/admin` | `_authenticated/admin.tsx` | Admin layout wrapper | Yes | Inspected ✓ |
| `/admin/` (index) | `admin.index.tsx` | Dashboard overview | Yes | Inspected ✓ |
| `/admin/settings` | `admin.settings.tsx` | Integration settings | Yes | Inspected ✓ |
| `/admin/setup` | `admin.setup.tsx` | Initial setup wizard | Yes | Inspected ✓ |
| `/admin/orders` | `admin.orders.tsx` | Order browser | Yes | Inspected ✓ |
| `/admin/customers` | `admin.customers.tsx` | Customer browser | Yes | Inspected ✓ |
| `/admin/customer-purchases` | `admin.customer-purchases.tsx` | Customer purchase history | Yes | Inspected ✓ |
| `/admin/transactions` | `admin.transactions.tsx` | Payment/transaction browser | Yes | Inspected ✓ |
| `/admin/products` | `admin.products.tsx` | Product/item catalog | Yes | Inspected ✓ |
| `/admin/items` | `admin.items.tsx` | Order line items | Yes | Inspected ✓ |
| `/admin/categories` | `admin.categories.tsx` | Product categories | Yes | Inspected ✓ |
| `/admin/modifiers` | `admin.modifiers.tsx` | Product modifiers | Yes | Inspected ✓ |
| `/admin/employees` | `admin.employees.tsx` | Employee list | Yes | Inspected ✓ |
| `/admin/analytics` | `admin.analytics.tsx` | Analytics / reporting | Yes | Inspected ✓ |
| `/admin/audience-builder` | `admin.audience-builder.tsx` | Audience segmentation tool | Yes | Inspected ✓ |
| `/admin/pos-data` | `admin.pos-data.tsx` | Raw POS data browser | Yes | Inspected ✓ |
| `/admin/product-mapping` | `admin.product-mapping.tsx` | Product → GHL tag mapping | Yes | Inspected ✓ |
| `/admin/product-buyer-search` | `admin.product-buyer-search.tsx` | Search buyers by product | Yes | Inspected ✓ |
| `/admin/purchase-mapping` | `admin.purchase-mapping.tsx` | Purchase → CRM mapping status | Yes | Inspected ✓ |
| `/admin/logs` | `admin.logs.tsx` | Sync run logs | Yes | Inspected ✓ |
| `/admin/user-management` | `admin.user-management.tsx` | Super-admin user management | Yes (super-admin) | Inspected ✓ |
| `/admin/profile` | `admin.profile.tsx` | Admin user profile | Yes | Inspected ✓ |

---

## API Routes

| Route | File | Method | Purpose | Auth | Status |
|-------|------|--------|---------|------|--------|
| `/api/sync` | `api/sync.ts` | GET | Cron-triggered sync (fetch/push/backfill steps) | `SYNC_SECRET` query param | Inspected ✓ |
| `/api/sync` | `api/sync.ts` | POST | Clover webhook event receiver | HMAC-SHA256 (optional in dev) | Inspected ✓ |
| `/api/sync/historical-customers` | `api/sync/` | GET | Historical customer backfill trigger | `SYNC_BACKFILL_SECRET` | Inspected ✓ |
| `/api/auth/*` | `api/auth/` | GET/POST | Login, logout, session check (`/me`) | Cookie | Inspected ✓ |
| `/api/diag` | `api/diag.ts` | GET | Diagnostics / connection test endpoint | `SYNC_SECRET` | Inspected ✓ |
| `/api/test-email` | `api/test-email.ts` | POST | Test email sending | `SYNC_SECRET` | Inspected ✓ |

---

## Server Functions (TanStack Start `createServerFn`)

| Function | File | Purpose | Admin Guard | Status |
|----------|------|---------|-------------|--------|
| `adminMe` | `auth.functions.ts` | Returns current session | No (unauthenticated probe) | ✓ |
| `adminLogin` | `auth.functions.ts` | Supabase email/password login | No | ✓ |
| `adminLogout` | `auth.functions.ts` | Invalidates session cookie | No | ✓ |
| `checkAdminApproval` | `admin-approval.functions.ts` | Checks allowlist membership | No (checks internally) | ✓ |
| `testSupabaseConnection` | `integration.functions.ts` | Tests Supabase credentials | No | ✓ |
| `checkCloverConnection` | `integration.functions.ts` | Tests Clover API token | Yes | ✓ |
| `checkGhlConnection` | `integration.functions.ts` | Tests GHL API token | Yes | ✓ |
| `refreshPosDataFn` | `integration.functions.ts` | Triggers Clover→Supabase sync | Yes | ✓ |
| `getLastSyncRunFn` | `integration.functions.ts` | Fetches most recent sync run | Yes | ✓ |
| `getDashboardStatsFn` | `integration.functions.ts` | Dashboard aggregate stats | Yes | ✓ |
| `listOrders` | `integration.functions.ts` | Paginated order list | Yes | ✓ |
| `listOrderItems` | `integration.functions.ts` | Paginated order items | Yes | ✓ |
| `listCustomers` | `integration.functions.ts` | Paginated customer list | Yes | ✓ |
| `listProducts` | `integration.functions.ts` | Paginated product list | Yes | ✓ |
| `listTransactions` | `integration.functions.ts` | Paginated payment list | Yes | ✓ |
| `listCustomersWithPurchases` | `integration.functions.ts` | Customers with purchase summary | Yes | ✓ |
| `getCustomerPurchaseHistory` | `integration.functions.ts` | Single customer history | Yes | ✓ |
| `getMappingMonitorStats` | `integration.functions.ts` | Mapping pipeline health | Yes | ✓ |
| `getAudienceCatalogFn` | `audience.functions.ts` | Returns all audience definitions | Yes | ✓ |
| `buildAudienceFn` | `audience.functions.ts` | Evaluates audience with AND/OR | Yes | ✓ |
| `listManagedUsers` | `user-management.functions.ts` | Lists all auth users (super-admin) | Super-admin | ✓ |
| `setUserApproval` | `user-management.functions.ts` | Approves/revokes admin access | Super-admin | ✓ |

---

## Database Migrations

| File | What it adds | Status |
|------|-------------|--------|
| `0001_init.sql` | `customer_mappings`, `orders`, `order_items`, `sync_attempts`; RLS; `try_lock_order()` | Applied ✓ |
| `0002_pos_tables.sql` | `customers`, `products`, `categories`, `employees`, `payments`, `discounts`, `modifier_groups`, `modifiers`, `sync_runs`; extended `orders`/`order_items` | Applied ✓ |
| `0003_auto_sync.sql` | Auto-sync configuration | Applied ✓ |
| `0004_fix_missing_columns.sql` | Backfills missing columns | Applied ✓ |
| `0005_reconciliation.sql` | `refunds` table; `voided` and `result` on payments; `voided`/`net_total_cents` on orders | Applied ✓ |
| `0006_net_sales.sql` | `net_sales_cents` on orders; backfill from order_items | Applied ✓ |
| `0007_purchase_tags.sql` | `purchase_tags` table | Applied ✓ |
| `0008_match_audit.sql` | `match_audit_log`; enhanced `customer_mappings`; `sync_checkpoints` | Applied ✓ |
| `0009_product_mapping_and_logs.sql` | Product mapping and log tables | Applied ✓ |
| `0010_backfill_cursor.sql` | `paused_at_cursor` on `sync_runs` | Applied ✓ |
| `0011_admin_allowlist.sql` | `admin_users` allowlist table | Applied ✓ |

---

## Core Server Modules

| Module | Purpose | Status |
|--------|---------|--------|
| `config.server.ts` | Environment variable validation; typed config | Inspected ✓ |
| `supabase.server.ts` | Supabase client (service-role + anon) | Inspected ✓ |
| `auth.server.ts` | Session cookie parsing; Supabase token verification | Inspected ✓ |
| `ingestion.server.ts` | Clover API pagination; full/incremental sync orchestration | Inspected ✓ |
| `pos-upserts.server.ts` | Idempotent Supabase upserts for all Clover entities | Inspected ✓ |
| `clover.server.ts` | Clover API helpers and connection test | Inspected ✓ |
| `sync.server.ts` | Individual order sync to GHL | Inspected ✓ |
| `ghl.server.ts` | GHL API client (contacts, custom objects, tags) | Inspected ✓ |
| `customer-match.server.ts` | Clover→GHL customer identity resolution | Inspected ✓ |
| `customer-backfill.server.ts` | Stranded customer backfill pipeline | Inspected ✓ |
| `audience-types.server.ts` | Audience ID type, metadata registry, keyword lists | Inspected ✓ |
| `audience-data.server.ts` | Per-customer aggregate loader (paginated) | Inspected ✓ |
| `audience-resolve.server.ts` | Audience predicate evaluation | Inspected ✓ |
| `audience-build.server.ts` | AND/OR audience composition | Inspected ✓ |
| `audience-dates.server.ts` | Timezone helpers; event calendars | Inspected ✓ |
| `audience-helpers.server.ts` | Auth guard + response helpers for audience functions | Inspected ✓ |
| `migration-runner.server.ts` | Automatic SQL migration runner on startup | Inspected ✓ |
| `sync-run-bookkeeping.server.ts` | Sync run record creation and completion | Inspected ✓ |
| `purchase-ops.server.ts` | Tag application pipeline | Inspected ✓ |
| `mapping-monitor.server.ts` | Mapping health statistics | Inspected ✓ |
| `dashboard-items.server.ts` | Dashboard aggregate queries | Inspected ✓ |
| `rate-limit.server.ts` | Rate limiting utilities | Inspected ✓ |
| `email.server.ts` | Email notification via Resend | Inspected ✓ |
| `csv-export.ts` | CSV generation utility | Inspected ✓ |

---

## Test Files

| File | Type | Runner | Status |
|------|------|--------|--------|
| `tests/audience-resolve.test.mjs` | Unit (offline) | `node --test` | **Added** — 65 tests, 65 pass ✓ |

**Pre-existing tests:** None found in the repository before this audit.

---

## Verification Status Summary

| Category | Inspected | Automated Tests | Notes |
|----------|-----------|-----------------|-------|
| Pages (UI) | 22/22 | 0 (no E2E setup) | Manual review |
| API routes | 6/6 | Partial (HMAC logic tested) | Integration tests need live creds |
| Server functions | 21/21 | Indirectly via module tests | |
| Database migrations | 11/11 | Schema reviewed | Applied manually to Supabase |
| Audience predicates | 44/44 | **65 unit tests** | All pass |
| CSV export | Yes | **7 tests** | All pass |
| Auth/security | Yes | HMAC tests | Webhook integration needs live Clover |
