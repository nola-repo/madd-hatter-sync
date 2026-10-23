# Madd Hatter Sync — Defect Register

> Audit date: 2026-10-22  
> Baseline TypeScript errors recorded before fixes. All code fixes are reflected in this register.

---

## Severity Definitions

| Level | Meaning |
|-------|---------|
| **Critical** | Data corruption, authentication bypass, security vulnerability, or consent violation |
| **High** | Incorrect business logic producing wrong results, silent data loss, or broken primary workflow |
| **Medium** | Incorrect behavior in non-primary flow, missing error handling, or UX defect |
| **Low** | Documentation inaccuracy, code quality issue, or non-impacting TypeScript error |

---

## Confirmed Defects

### DEF-001 — Monetary thresholds exclude exact boundary values

| Field | Value |
|-------|-------|
| **ID** | DEF-001 |
| **Severity** | High |
| **File** | `src/lib/integration/audience-resolve.server.ts` |
| **Lines** | 96–127 |
| **Status** | ✅ Fixed |

**Evidence:** Six audience predicates used strict `>` comparison:
```ts
// BEFORE (wrong — excluded exact boundary)
match = c.orders.some((o) => (o.total_cents || 0) > 25000);
// AFTER (correct — includes $250.00 exactly)
match = c.orders.some((o) => (o.total_cents || 0) >= 25000);
```

Affected audiences: `single_check_250`, `single_check_500`, `single_check_750`, `single_check_1000`, `lifetime_2500`, `lifetime_5000`.

**Root cause:** Strict `>` operator when the audience labels (`$250+`, `$500+`, etc.) indicate inclusive boundaries. A customer spending exactly $250.00 on one check was excluded from the `$250+` audience.

**Business impact:** Under-counting customers in all six spend-based audiences. Customers at exactly the threshold amount are excluded from marketing segments they should be in.

**Fix:** Changed all six comparisons to `>=`. Updated description strings in `audience-types.server.ts` to accurately say `>= $X` instead of "exceeds $X" or "strictly > $X".

**Regression tests:** DEF-001 has 18 dedicated boundary tests in `tests/audience-resolve.test.mjs` — all pass.

---

### DEF-002 — CSV formula injection vulnerability

| Field | Value |
|-------|-------|
| **ID** | DEF-002 |
| **Severity** | High |
| **File** | `src/lib/csv-export.ts` |
| **Lines** | 6–13 |
| **Status** | ✅ Fixed |

**Evidence:** The original `escapeCsv` function only quoted values containing commas, double-quotes, or newlines. Values beginning with `=`, `+`, `-`, or `@` were passed through unchanged and would execute as spreadsheet formulas when opened in Excel, Google Sheets, or LibreOffice Calc.

```ts
// BEFORE — vulnerable
const str = String(value);
if (str.includes(",") || str.includes('"') || ...) { ... }

// AFTER — injection-safe
if (FORMULA_INJECTION_PREFIXES.test(str)) { str = "\t" + str; }
// Then: also quotes if str contains \t
```

**Root cause:** Missing formula-injection mitigation per OWASP CSV Injection guidance.

**Business impact:** An attacker who can control customer names, product names, or any other field that appears in a CSV export could inject formulas that execute when an admin opens the export. The most common real-world outcome is DDE-based remote code execution or data exfiltration.

**Fix:** Prefixed injection-prefix values with a tab character (rendering them inert as plain text), then quoted the result per RFC 4180. Tab-prefixed values are human-readable and preserve the original content.

**Regression tests:** 7 tests in `tests/audience-resolve.test.mjs` — all pass.

---

### DEF-003 — `requireAdmin()` in audience-helpers is a no-op (auth bypass)

| Field | Value |
|-------|-------|
| **ID** | DEF-003 |
| **Severity** | Critical |
| **File** | `src/lib/integration/audience-helpers.server.ts` |
| **Lines** | 24–27 |
| **Status** | ✅ Fixed |

**Evidence:**
```ts
// BEFORE — returned null silently; callers could not detect unauthenticated access
export async function requireAdmin() {
  const session = await getAdminSession();
  return session;  // ← returned null if unauthenticated
}

// AFTER — throws 401 exactly as integration.functions.ts does
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session;
}
```

**Root cause:** The `audience-helpers.server.ts` version of `requireAdmin()` forgot to enforce the null check, unlike the identical function in `integration.functions.ts` which correctly throws a 401 Response.

**Business impact:** Any unauthenticated caller could invoke `getAudienceCatalogFn` and `buildAudienceFn` server functions and receive audience membership data including customer names, emails, phone numbers, lifetime spend, and GHL contact IDs — a direct PII disclosure.

**Fix:** Added the missing null check and 401 throw to match the pattern in `integration.functions.ts`.

**Regression tests:** Auth logic is exercised indirectly; a dedicated server function integration test requires a live Supabase environment.

---

### DEF-004 — TypeScript TS2783: duplicate `range` key in Response.json spread

| Field | Value |
|-------|-------|
| **ID** | DEF-004 |
| **Severity** | Medium |
| **File** | `src/routes/api/sync.ts` |
| **Line** | 87 |
| **Status** | ✅ Fixed |

**Evidence:** TypeScript `strictMode` flags TS2783 ("range is specified more than once, so this usage will be overwritten"):
```ts
// BEFORE — range: rangeParam overwritten by ...result which also has { range }
return Response.json({ ok: true, step: "fetch", range: rangeParam, ...result });

// AFTER — stepFetch already returns { range }, no duplicate
return Response.json({ ok: true, step: "fetch", ...result });
```

**Root cause:** `stepFetch()` returns an object already containing `range`, so adding `range: rangeParam` before the spread creates a duplicate.

**Business impact:** Low functional impact (the spread overrides the explicit value with the same value). TypeScript treats this as a compile error in strict mode which blocks CI type-check gates.

**Fix:** Removed the explicit `range: rangeParam` field; the value is already present in `...result`.

---

### DEF-005 — TypeScript TS4111: `process.env` index-signature dot-notation errors

| Field | Value |
|-------|-------|
| **ID** | DEF-005 |
| **Severity** | Low |
| **File** | `src/routes/api/sync.ts`, `src/routes/api/diag.ts`, `src/routes/api/test-email.ts`, `src/routes/api/sync/historical-customers.ts` |
| **Status** | ✅ Fixed (sync.ts); Remaining in diag.ts, test-email.ts, historical-customers.ts |

**Evidence:** `exactOptionalPropertyTypes` in tsconfig requires `process.env["KEY"]` bracket notation, not `process.env.KEY` dot notation when the key comes from an index signature.

**Fix:** Converted `process.env.SYNC_SECRET` → `process.env["SYNC_SECRET"]` and `process.env.SYNC_BATCH_LIMIT` → `process.env["SYNC_BATCH_LIMIT"]` in `sync.ts`.

**Remaining:** The same pattern exists in `diag.ts`, `test-email.ts`, and `historical-customers.ts`. These do not block the dev server but fail type-check.

---

### DEF-006 — TypeScript TS2379 / TS4111 in `user-management.functions.ts`

| Field | Value |
|-------|-------|
| **ID** | DEF-006 |
| **Severity** | Low |
| **File** | `src/lib/integration/user-management.functions.ts` |
| **Lines** | 77–83, 108, 150 |
| **Status** | ✅ Fixed |

**Evidence:** `exactOptionalPropertyTypes` requires explicit `undefined` coercion on optional fields, and index-signature properties require bracket notation:
```ts
// BEFORE
email: u.email,                                 // TS2379
fullName: u.user_metadata?.full_name as ...    // TS4111

// AFTER
email: u.email ?? undefined,                    // OK
fullName: u.user_metadata?.["full_name"] as ... // OK
```

**Fix:** Applied `?? undefined` coercion for optional Supabase auth user fields; switched to bracket notation for `user_metadata` index-signature access.

---

### DEF-007 — TypeScript TS4111 in `register.tsx`

| Field | Value |
|-------|-------|
| **ID** | DEF-007 |
| **Severity** | Low |
| **File** | `src/routes/register.tsx` |
| **Lines** | 63–68, 195–288 |
| **Status** | ⚠️ Identified, Not Yet Fixed |

**Evidence:** Multiple `TS4111` errors: `'fullName'`, `'email'`, `'password'`, `'confirm'` properties accessed via dot notation on form data objects that come from index signatures (react-hook-form `getValues()` return type).

**Recommended fix:** Use bracket notation: `data["fullName"]` instead of `data.fullName`.

---

### DEF-008 — Webhook accepts unsigned POST requests when `CLOVER_WEBHOOK_SECRET` is absent

| Field | Value |
|-------|-------|
| **ID** | DEF-008 |
| **Severity** | High (Security) |
| **File** | `src/routes/api/sync.ts` |
| **Lines** | 162–172 |
| **Status** | ⚠️ Known, intentional for dev — production risk documented |

**Evidence:**
```ts
// When cloverSecret is falsy:
console.warn("[clover-webhook] CLOVER_WEBHOOK_SECRET not set — accepting unverified webhook.");
// ... proceeds to process the webhook
```

**Analysis:** The code intentionally allows unsigned webhooks when `CLOVER_WEBHOOK_SECRET` is not configured (to support dev/sandbox environments). The `.env.example` file leaves `CLOVER_WEBHOOK_SECRET=` blank and notes "not recommended for production."

**Business impact in production:** If `CLOVER_WEBHOOK_SECRET` is absent in production, any HTTP client can trigger Clover sync operations (fetch + push), potentially flooding the CRM or causing runaway billing. An attacker with knowledge of the endpoint can trigger GHL contact creation for fabricated orders.

**Recommended fix:** Add a `CLOVER_WEBHOOK_REQUIRE_SECRET=true` env var that, when set, blocks all webhook processing when the secret is absent. This fails closed in production without breaking dev flows.

---

### DEF-009 — Incremental sync capped at 1 page (50 orders) per cron tick

| Field | Value |
|-------|-------|
| **ID** | DEF-009 |
| **Severity** | Medium |
| **File** | `src/lib/integration/ingestion.server.ts` |
| **Lines** | 351–356 |
| **Status** | ⚠️ Intentional design, undocumented limitation |

**Evidence:**
```ts
const maxOrderPages = kind === "incremental" ? 1 : 150;
const orderPageOpts = {
  limit: kind === "incremental" ? 50 : 100,
  ...
};
```

**Analysis:** This is a deliberate design choice to stay within the 30-second Cloudflare Worker / cron-job.org timeout. However, if more than 50 orders arrive between cron ticks (e.g., after a busy event night), the excess is silently left for the next tick without any notification that data is backlogged.

**Business impact:** During high-volume periods, the cron lag can be several hours before all orders are processed. There is no backlog metric visible in the dashboard.

**Recommended fix:** Add a `hasMore` field to the sync result when `orders.length >= limit`. Surface the backlog count in the dashboard UI.

---

### DEF-010 — Birthday audiences silently return empty sets

| Field | Value |
|-------|-------|
| **ID** | DEF-010 |
| **Severity** | Medium |
| **File** | `src/lib/integration/audience-resolve.server.ts` lines 174–189; `src/lib/integration/audience-build.server.ts` lines 138–142 |
| **Status** | ⚠️ Known, warning implemented, not yet resolved |

**Evidence:** All 10 birthday audience predicates (`birthday_oct` through `birthday_jul`) always return `false`. The `audience-build.server.ts` emits a warning when birthday audiences are requested, but the UI still displays them as selectable options.

**Root cause:** The Clover ingestion path does not capture birthday data. The `customers` table has no `birthday` column.

**Business impact:** Any campaign targeting birthday audiences will have 0 recipients. The feature is advertised in the UI but does not work.

**Recommended fix:**
1. Identify a data source for birthdays (Clover loyalty data, GHL custom fields, or a separate intake form).
2. Add `birthday_month` column (1–12) to the `customers` table via migration.
3. Ingest birthday data in the Clover customer pull.
4. Implement the birthday predicate using the month field.
5. Until implemented: visually mark birthday audiences as "Not available — birthday data not yet configured" in the UI.

---

### DEF-011 — `loadAggregates` fetches customers without pagination cap

| Field | Value |
|-------|-------|
| **ID** | DEF-011 |
| **Severity** | Medium |
| **File** | `src/lib/integration/audience-data.server.ts` |
| **Lines** | 106–129 |
| **Status** | ⚠️ Identified, Not Fixed |

**Evidence:**
```ts
const { data: custRows, error: cErr } = await sb
  .from("customers")
  .select("...")
  .eq("clover_merchant_id", mid);
  // ← No .range() or .limit() — fetches ALL rows
```

The `customer_mappings` query has the same unbounded pattern. PostgREST's default row limit is 1000. Merchants with more than 1000 customers will silently receive truncated data.

**Business impact:** Audience counts will be wrong for any merchant with > 1000 customers or mappings.

**Recommended fix:** Add the same `for(;;) { .range(off, off+PAGE-1) }` pagination loop used by `fetchAllOrders` and `fetchAllItems` in the same file.

---

### DEF-012 — 15 npm dependency vulnerabilities (4 moderate, 6 high, 5 critical)

| Field | Value |
|-------|-------|
| **ID** | DEF-012 |
| **Severity** | High (Critical: TanStack XSS) |
| **File** | `package.json` |
| **Status** | ⚠️ Identified, Owner decision required |

**Evidence (npm audit):**
- **Critical:** `@tanstack/react-start` 1.168.x — reflected XSS in server-function responses (GHSA-qx66-fv34-fjm8). Fix: upgrade to ≥1.169.4.
- **High:** `vite` 8.1.5 — multiple Windows escape + SSRF vulnerabilities. Fix: upgrade to ≥8.3.5.
- **High/Moderate:** `braces`, `micromatch`, `fast-glob`, `postcss-selector-parser` — via `@leadconnector/vite-tanstack-config` devDependency. No direct fix available; may require updating the Leadconnector config package.

**Recommended action:**
1. Upgrade `@tanstack/react-start` to ≥1.169.4 (outside stated semver range; test carefully).
2. Upgrade `vite` to ≥8.3.5 (outside stated semver range).
3. Test the application after upgrades — TanStack Start minor version bumps can introduce API changes.

---

## Suspected Risks (Unverified Without Live Integration)

| ID | Area | Risk | Severity Estimate |
|----|------|------|-------------------|
| RISK-001 | `ghl.server.ts` | GHL API rate-limit handling may not back off consistently across all call sites | Medium |
| RISK-002 | `customer-match.server.ts` | Name-only customer matching (rule E/F) may inadvertently merge different people with common names | High |
| RISK-003 | `pos-upserts.server.ts` `upsertOrderRecord` | When `order.total` is 0 and line items are empty, `net_sales_cents` = 0. Orders with only service charges or tips may record $0 revenue | Medium |
| RISK-004 | `ingestion.server.ts` fallback block | When the rich order fetch fails and falls back to minimal expansion, the sync logs "completed" without distinguishing degraded imports | Medium |
| RISK-005 | Webhook replay | No deduplication by Clover event ID in the POST handler; duplicate webhook deliveries trigger duplicate sync operations | Medium |
| RISK-006 | `loadAggregates` memory | Loading all orders + order_items for a high-volume merchant into memory may exceed Cloudflare Worker memory limits | High |
| RISK-007 | `admin_users` RLS | The `admin_users` table is missing explicit RLS deny policy; service role bypasses this, but the anon key policy should be verified | Medium |
