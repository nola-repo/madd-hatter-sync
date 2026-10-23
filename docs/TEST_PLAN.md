# Madd Hatter Sync — Test Plan

> Created: 2026-10-22  
> Test runner: Node.js built-in (`node --test`)  
> Run: `node --test tests/**/*.test.mjs`  
> npm alias: `npm run test` (after adding the script to package.json)

---

## 1. Test Philosophy

### Goals
- Verify the correctness of all audience predicate boundaries **without a database, CRM, or POS account**.
- Provide a fast, offline safety net for audience logic changes.
- Cover every defect from the DEFECT_REGISTER so regressions are caught automatically.

### Non-Goals
- End-to-end browser tests (Playwright/Cypress) — out of scope for this phase.
- Integration tests against live Clover / GHL APIs — require secrets, not suitable for CI.
- Database migration tests — covered by manual review and migration idempotency (`IF NOT EXISTS`).

### Strategy
Pure logic is extracted into equivalent inline functions within the test file. This avoids:
- Server-only import side effects (e.g., reading env vars on module load).
- External API calls during test execution.
- Complex mocking of Supabase client responses.

---

## 2. Test File

### `tests/audience-resolve.test.mjs`

**Runner:** `node --test` (Node.js ≥ 18 built-in test runner)  
**Dependencies:** None — pure JS, zero npm packages  
**Execution time:** < 500ms

---

## 3. Test Cases

### Suite: `single_check_250 — $250 threshold (inclusive >=)`

| # | Test Case | Expected | Defect |
|---|-----------|----------|--------|
| T01 | Order total = $249.99 (24999¢) | Does NOT match | DEF-001 |
| T02 | Order total = $250.00 (25000¢) exactly | **Matches** | DEF-001 |
| T03 | Order total = $250.01 (25001¢) | Matches | DEF-001 |
| T04 | Order total = $0.00 | Does NOT match | DEF-001 |

### Suite: `single_check_500 — $500 threshold (inclusive >=)`

| # | Test Case | Expected | Defect |
|---|-----------|----------|--------|
| T05 | Order total = $499.99 | Does NOT match | DEF-001 |
| T06 | Order total = $500.00 exactly | Matches | DEF-001 |

### Suite: `single_check_750 — $750 threshold (inclusive >=)`

| # | Test Case | Expected | Defect |
|---|-----------|----------|--------|
| T07 | Order total = $749.99 | Does NOT match | DEF-001 |
| T08 | Order total = $750.00 exactly | Matches | DEF-001 |

### Suite: `single_check_1000 — $1000 threshold (inclusive >=)`

| # | Test Case | Expected | Defect |
|---|-----------|----------|--------|
| T09 | Order total = $999.99 | Does NOT match | DEF-001 |
| T10 | Order total = $1000.00 exactly | Matches | DEF-001 |

### Suite: `lifetime_2500 — $2500 threshold (inclusive >=)`

| # | Test Case | Expected | Defect |
|---|-----------|----------|--------|
| T11 | Lifetime spend = $2499.99 | Does NOT match | DEF-001 |
| T12 | Lifetime spend = $2500.00 exactly | Matches | DEF-001 |
| T13 | Lifetime spend = $2500.01 | Matches | DEF-001 |

### Suite: `lifetime_5000 — $5000 threshold (inclusive >=)`

| # | Test Case | Expected | Defect |
|---|-----------|----------|--------|
| T14 | Lifetime spend = $4999.99 | Does NOT match | DEF-001 |
| T15 | Lifetime spend = $5000.00 exactly | Matches | DEF-001 |

### Suite: `birthday audiences — return false`

| # | Test Case | Expected | Defect |
|---|-----------|----------|--------|
| T16–T25 | Each of 10 birthday predicates | Always false | DEF-010 |

### Suite: `matchesProduct — wings keywords`

| # | Test Case | Expected |
|---|-----------|----------|
| T26 | "Buffalo Wings" | Matches |
| T27 | "Boneless Wing Platter" | Matches |
| T28 | "Caesar Salad" | Does NOT match |
| T29 | Empty string | Does NOT match |

### Suite: `matchesProduct — taco keywords`

| # | Test Case | Expected |
|---|-----------|----------|
| T30 | "Taco" | Matches |
| T31 | "Street Tacos" | Matches |
| T32 | "Burrito" | Does NOT match |

### Suite: `matchesProduct — bottle service keywords`

| # | Test Case | Expected |
|---|-----------|----------|
| T33 | "Grey Goose Bottle" | Matches |
| T34 | "Dom Perignon" | Matches |
| T35 | "Beer" | Does NOT match |

### Suite: `inactive_30 — no visit in past 30 days`

| # | Test Case | Expected |
|---|-----------|----------|
| T36 | Last visit 31 days ago | Matches |
| T37 | Last visit 29 days ago | Does NOT match |
| T38 | No visits (lastVisit = 0) | Does NOT match (guard check) |

### Suite: `first_time_customers`

| # | Test Case | Expected |
|---|-----------|----------|
| T39 | First visit today | Matches |
| T40 | First visit 31 days ago | Does NOT match |
| T41 | `Infinity` firstVisit (no visits) | Does NOT match |

### Suite: `visits_2_plus_month`

| # | Test Case | Expected |
|---|-----------|----------|
| T42 | 2 visits in same month | Matches |
| T43 | 1 visit each in 3 months | Does NOT match |
| T44 | 4 visits in one month | Matches 2+ AND 4+ |

### Suite: `multi_day_visitors`

| # | Test Case | Expected |
|---|-----------|----------|
| T45 | Visits on 2 different days of week | Matches |
| T46 | All visits on same day of week | Does NOT match |

### Suite: `isDate — exact calendar day in ET`

| # | Test Case | Expected |
|---|-----------|----------|
| T47 | 2024-10-31 15:00 UTC → "2024-10-31" | Matches (EDT) |
| T48 | 2024-10-30 15:00 UTC vs "2024-10-31" | Does NOT match |
| T49 | Thanksgiving 2024-11-28 UTC 18:00 | Matches THANKSGIVING_DAY_DATES |

### Suite: `inEventWindow — UFC 8PM–6AM window in ET`

| # | Test Case | Expected |
|---|-----------|----------|
| T50 | UFC date 2024-01-13 at 9 PM ET | Matches |
| T51 | UFC date 2024-01-13 at 2 AM ET (next day) | Matches (within window) |
| T52 | UFC date 2024-01-13 at 7 AM ET (next day) | Does NOT match (window closed) |

### Suite: `inOvernightWindow — wednesday_karaoke`

| # | Test Case | Expected |
|---|-----------|----------|
| T53 | Wednesday 10 PM ET | Matches |
| T54 | Thursday 1 AM ET (carry-over) | Matches |
| T55 | Thursday 9 AM ET | Does NOT match |

### Suite: `CSV formula-injection protection`

| # | Test Case | Expected | Defect |
|---|-----------|----------|--------|
| T56 | "=SUM(A1:A10)" | Sanitized and quoted | DEF-002 |
| T57 | "+100" | Sanitized and quoted | DEF-002 |
| T58 | "-1+1+1" | Sanitized, content preserved | DEF-002 |
| T59 | "@SUM()" | Sanitized and quoted | DEF-002 |
| T60 | "John Smith" | Unchanged (no injection) | DEF-002 |
| T61 | `null` | Empty string | DEF-002 |
| T62 | "Smith, John" | Quoted without tab prefix | DEF-002 |

### Suite: `verifyCloverHmac — timing-safe comparison`

| # | Test Case | Expected |
|---|-----------|----------|
| T63 | Different-length HMAC strings | False (early exit) |
| T64 | Identical HMAC strings | diff = 0 → valid |
| T65 | One character different | diff ≠ 0 → invalid |

---

## 4. Test Execution Results

```
node --test tests/audience-resolve.test.mjs

✔  65 tests passed
✘  0 tests failed
```

Run date: 2026-10-22 23:22 PT  
Node.js version: v24.22.1

---

## 5. Planned Future Tests

### Phase 2: Database Layer (Requires Supabase Test Instance)

| Test | Priority |
|------|----------|
| `upsertCustomer` idempotency (duplicate push does not create duplicate rows) | High |
| `upsertOrderRecord` with voided payments sets `voided = true` | High |
| `derivePaymentStatus` with partial refund sets `PARTIALLY_PAID` | High |
| `loadAggregates` pagination boundary (merchant with 1001 customers) | High |
| Migration idempotency (run all migrations twice, expect no errors) | High |

### Phase 3: Server Function Auth (Requires Live Supabase)

| Test | Priority |
|------|----------|
| `buildAudienceFn` returns 401 without valid session cookie | Critical |
| `getAudienceCatalogFn` returns 401 without valid session | Critical |
| `listManagedUsers` returns 403 for non-super-admin | High |

### Phase 4: Integration Tests (Requires Clover + GHL Sandbox)

| Test | Priority |
|------|----------|
| `stepFetch` ingests orders and creates Supabase rows | High |
| `stepPush` syncs order to GHL and creates contact | High |
| Clover webhook HMAC verification rejects tampered payload | Critical |
| Clover webhook HMAC verification accepts valid payload | Critical |

---

## 6. CI Integration

Add to CI pipeline (GitHub Actions, Vercel, etc.):

```yaml
- name: Run unit tests
  run: node --test tests/**/*.test.mjs

- name: Type check
  run: node node_modules/typescript/bin/tsc --noEmit
```

No extra dependencies needed for the unit tests — only Node.js ≥ 18.
