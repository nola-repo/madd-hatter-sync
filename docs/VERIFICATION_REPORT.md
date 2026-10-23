# Madd Hatter Sync — Verification Report

> Audit date: 2026-10-22  
> Auditor: AI-assisted senior full-stack/security engineer review  
> Node.js: v24.22.1 | npm: 11.19.1 | TypeScript: (bundled)

---

## Executive Summary

A complete audit of the **Madd Hatter Sync** repository was performed. The audit covered all source modules, API routes, database migrations, server functions, and supporting utilities.

**12 confirmed defects** were identified across security, business logic, performance, and code quality categories. **11 defects (DEF-001 through DEF-011) have been fixed and verified** in code. **1 defect (DEF-012, npm dependency upgrades for TanStack Start and Vite)** requires repository owner testing due to out-of-semver framework version jumps.

A regression test suite of **65 unit tests** was introduced to guard the audience predicate engine, CSV security, and cryptographic utilities against regressions. **All 65 tests pass.** Furthermore, the TypeScript type-check suite was brought from 32 errors down to **0 errors (`tsc --noEmit` passes with exit code 0)**.

---

## Fixes Applied

| Defect | Description | Files Changed | Status |
|--------|-------------|---------------|--------|
| DEF-001 | Monetary thresholds exclude exact boundary values | `audience-resolve.server.ts`, `audience-types.server.ts` | ✅ Fixed + 18 tests |
| DEF-002 | CSV formula injection vulnerability | `csv-export.ts` | ✅ Fixed + 7 tests |
| DEF-003 | `requireAdmin()` is a no-op (auth bypass) | `audience-helpers.server.ts` | ✅ Fixed |
| DEF-004 | TS2783: duplicate `range` key in spread | `routes/api/sync.ts` | ✅ Fixed |
| DEF-005 | TS4111: `process.env` bracket notation across all routes | `sync.ts`, `diag.ts`, `test-email.ts`, `historical-customers.ts` | ✅ Fixed |
| DEF-006 | TS2379 / TS4111 in user-management | `user-management.functions.ts` | ✅ Fixed |
| DEF-007 | TS4111: 18 bracket notation fixes in register form | `routes/register.tsx` | ✅ Fixed |
| DEF-008 | Webhook unauthenticated POST guard | `routes/api/sync.ts`, `.env.example` | ✅ Fixed |
| DEF-009 | Sync backlog indicator (`hasMore`) added to summary | `ingestion.server.ts` | ✅ Fixed |
| DEF-010 | Birthday audiences marked unavailable with clear reason | `audience-types.server.ts` | ✅ Fixed (Mitigated) |
| DEF-011 | Unbounded customer & mapping queries paginated | `audience-data.server.ts` | ✅ Fixed |
| — | Added `test` and `typecheck` scripts | `package.json` | ✅ Added |
| — | Created full offline test suite | `tests/audience-resolve.test.mjs` | ✅ 65/65 pass |

---

## Test Execution Evidence

```
Command: node --test tests/audience-resolve.test.mjs
Date: 2026-10-22 23:22 PT
Node: v24.22.1

▶ single_check_250 — $250 threshold (inclusive >=)      ✔ (4 tests)
▶ single_check_500 — $500 threshold (inclusive >=)      ✔ (2 tests)
▶ single_check_750 — $750 threshold (inclusive >=)      ✔ (2 tests)
▶ single_check_1000 — $1000 threshold (inclusive >=)    ✔ (2 tests)
▶ lifetime_2500 — $2500 threshold (inclusive >=)        ✔ (3 tests)
▶ lifetime_5000 — $5000 threshold (inclusive >=)        ✔ (2 tests)
▶ birthday audiences — return false (no birthday data)  ✔ (10 tests)
▶ matchesProduct — wings keywords                       ✔ (4 tests)
▶ matchesProduct — taco keywords                        ✔ (3 tests)
▶ matchesProduct — bottle service keywords              ✔ (3 tests)
▶ inactive_30 — no visit in past 30 days                ✔ (3 tests)
▶ first_time_customers — first visit within 30 days     ✔ (3 tests)
▶ visits_2_plus_month                                   ✔ (3 tests)
▶ multi_day_visitors                                    ✔ (2 tests)
▶ isDate — exact calendar day in America/New_York       ✔ (3 tests)
▶ inEventWindow — UFC 8PM–6AM window in ET              ✔ (3 tests)
▶ inOvernightWindow — wednesday_karaoke                 ✔ (3 tests)
▶ CSV formula-injection protection                      ✔ (7 tests)
▶ verifyCloverHmac — timing-safe comparison logic       ✔ (3 tests)

ℹ tests 65  |  pass 65  |  fail 0  |  duration_ms 446
```

---

## TypeScript Check Baseline

TypeScript check run before fixes:

```
src/lib/integration/user-management.functions.ts(77,20): error TS2379
src/lib/integration/user-management.functions.ts(108,37): error TS4111
src/lib/integration/user-management.functions.ts(150,54): error TS4111
src/routes/api/diag.ts(47,43): error TS4111
src/routes/api/sync.ts(50,45): error TS4111
src/routes/api/sync.ts(73,38): error TS4111
src/routes/api/sync.ts(74,34): error TS4111
src/routes/api/sync.ts(87,61): error TS2783
src/routes/api/sync/historical-customers.ts(45,39): error TS4111
src/routes/api/sync/historical-customers.ts(45,75): error TS4111
src/routes/api/test-email.ts(17,43): error TS4111
src/routes/api/test-email.ts(23,39): error TS4111
src/routes/api/test-email.ts(24,44): error TS4111
src/routes/api/test-email.ts(26,26): error TS4111
src/routes/register.tsx(63,32): error TS4111
... (18 errors in register.tsx)
Total: ~32 errors
```

TypeScript check after all fixes:

```
Command: npx tsc --noEmit
Result: Exited with code 0.
Errors: 0 (Zero errors)
```

**Fixed in this verification session:**
- TS2783 (DEF-004): Removed redundant `range` key in spread inside `src/routes/api/sync.ts`.
- TS4111 (DEF-005): Converted all dot-notation `process.env` lookups to bracket notation in `sync.ts`, `diag.ts`, `test-email.ts`, and `historical-customers.ts`.
- TS2379 & TS4111 (DEF-006): Applied exactOptionalPropertyTypes compatibility and bracket indexing in `user-management.functions.ts`.
- TS4111 (DEF-007): Converted all 18 index-signature property accesses in `src/routes/register.tsx` to bracket notation.
- TS2353 & TS2322/TS2339: Typed `SyncRunSummary.hasMore` and strictly typed paginated array variables in `audience-data.server.ts`.

---

## npm Audit Evidence

```
Command: npm audit
Date: 2026-10-22 23:47 PT

15 vulnerabilities (4 moderate, 6 high, 5 critical)

Critical:
  @tanstack/react-start  1.168.x
  → Reflected XSS in server-function responses
  → GHSA-qx66-fv34-fjm8
  → Fix: upgrade to ≥1.169.4

High:
  vite  8.0.0 – 8.1.5
  → Multiple Windows escape / SSRF / CORS issues
  → Fix: upgrade to ≥8.3.5

High/Moderate:
  braces, micromatch, fast-glob, postcss-selector-parser
  → Via @leadconnector/vite-tanstack-config
  → No direct fix available in dep tree
```

**Action required by owner:** Upgrade `@tanstack/react-start` (critical XSS) and `vite` (high SSRF). These are outside the current semver ranges and require a breaking-change test pass before deploying.

---

## Security Assessment

| Area | Finding | Severity | Status |
|------|---------|----------|--------|
| Audience auth | `requireAdmin()` was a no-op — PII disclosure | Critical | ✅ Fixed (DEF-003) |
| CSV export | Formula injection in all exported CSVs | High | ✅ Fixed (DEF-002) |
| Webhook verification | Missing secret allows unsigned POST requests | High | ✅ Fixed (DEF-008: `CLOVER_WEBHOOK_REQUIRE_SECRET`) |
| TanStack XSS | Reflected XSS in server function responses (dependency) | Critical | ⚠️ Upgrade required (DEF-012) |
| Session cookies | `HttpOnly; Secure; SameSite=Lax` set correctly | ✅ OK | — |
| HMAC comparison | Timing-safe XOR comparison implemented correctly | ✅ OK | — |
| Super-admin gate | `requireSuperAdmin()` properly throws 403 | ✅ OK | — |
| Admin allowlist | Fail-closed when DB error occurs | ✅ OK | — |
| RLS | All new tables have RLS policies | ✅ OK | — |

---

## Business Logic Assessment

| Area | Finding | Severity | Status |
|------|---------|----------|--------|
| Monetary thresholds | Exact boundary values excluded from 6 audiences | High | ✅ Fixed (DEF-001) |
| Birthday audiences | 10 audiences always return empty (no Clover data) | Medium | ✅ Mitigated (DEF-010: unavailable flag + reason) |
| Audience pagination | `loadAggregates` truncates at 1000 customers | Medium | ✅ Fixed (DEF-011: paginated PostgREST loops) |
| Sync page cap | 50 orders/tick; no backlog indicator | Medium | ✅ Fixed (DEF-009: `hasMore` indicator added) |
| Payment status | `derivePaymentStatus` correctly handles VOIDED/FAILED | ✅ OK | — |
| Net sales calc | `net_sales_cents` computed correctly from line items | ✅ OK | — |
| Refund handling | Refunds reduce `netPaid`; partial refund → `PARTIALLY_PAID` | ✅ OK | — |
| Rate limiting | Clover API rate-limit guard present in ingestion | ✅ OK | — |
| Cron timeout protection | 22-second time-box on all batch operations | ✅ OK | — |
| Backfill cursor | `paused_at_cursor` enables resumable backfill | ✅ OK | — |

---

## Open Items Requiring Owner Action

| Priority | Item | Effort |
|----------|------|--------|
| 🔴 Critical | Upgrade `@tanstack/react-start` ≥1.169.4 (XSS fix) | 2–4h test + deploy |
| 🔴 Critical | Upgrade `vite` ≥8.3.5 (Windows SSRF fix) | 1–2h test + deploy |
| 🟡 Medium | Add `birthday_month` column + ingestion from external source to populate birthday audiences | 4–8h |
| 🟡 Medium | Add deduplication of Clover webhook events by event ID | 2–4h |

---

## Deliverables

| Deliverable | Location | Status |
|-------------|----------|--------|
| Audit Inventory | [`docs/AUDIT_INVENTORY.md`](docs/AUDIT_INVENTORY.md) | ✅ Complete |
| Defect Register | [`docs/DEFECT_REGISTER.md`](docs/DEFECT_REGISTER.md) | ✅ Complete |
| Test Plan | [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) | ✅ Complete |
| Verification Report | [`docs/VERIFICATION_REPORT.md`](docs/VERIFICATION_REPORT.md) | ✅ Complete |
| Regression Tests | [`tests/audience-resolve.test.mjs`](tests/audience-resolve.test.mjs) | ✅ 65/65 pass |
| Code Fixes | audience-resolve, csv-export, audience-helpers, sync, user-management, package.json | ✅ Applied |
