# QA Framework Strategy — Saleor Commerce POC

---

## 1. Division of Responsibilities Between Layers

### Layer 1: GraphQL API (Playwright / raw HTTP + GraphQL client)

**What we test here:**
- Correctness of data returned (schema shape, field values, nullability)
- Business logic enforced at the API level (pricing, stock, checkout state machine)
- Authentication & authorization (JWT tokens, permissions)
- Error handling (expected GraphQL errors vs. network errors)

**What we do NOT test here:**
- Visual rendering, CSS, layout
- React component behavior
- Accessibility

**Tests in scope for POC:**

| Area | Test |
|------|------|
| Products | `products` query — list returns items with name, pricing, thumbnail |
| Products | `product(id)` — detail returns correct variant/attributes |
| Checkout | `checkoutCreate` → `checkoutLinesAdd` → `checkoutComplete` happy path |
| Customer | `accountRegister` → `tokenCreate` (login) |

---

### Layer 2: Dashboard UI (Playwright, browser-based)

**What we test here:**
- Critical admin workflows that span multiple UI steps
- Form validation UX (error states visible to user)
- Optimistic UI vs. confirmed server state
- Role-gated visibility (staff-only pages)

**What we do NOT test here:**
- API response shapes (API layer owns that)
- Data setup — use API calls in `beforeAll`/`beforeEach` to seed state

**Tests in scope for POC:**

| Area | Test |
|------|------|
| Products | Create product type + product via UI, assert it appears in product list |
| Vouchers | Create percentage voucher, assert it appears in voucher list |
| Draft Orders | Create draft order from existing customer + product, assert status = Draft |

---

### Layer 3: Accessibility (Playwright + axe-core via `@axe-core/playwright`)

**What we test here:**
- WCAG 2.1 AA violations on key pages (not the whole app)
- Keyboard navigability on interactive flows
- Focus management after modal/dialog open/close

**Scope for POC:** Dashboard login page + product creation form (2 pages, automated axe scan).

---

## 2. Dependencies Between Layers

Saleor Cloud free sandboxes are pre-seeded with sample data (channels, products, shipping methods). Tests should **read** this data where possible rather than recreating it.
Test-owned data — anything that will be mutated, deleted, or whose existence must be guaranteed —
must be created via API and cleaned up after the suite.

### Data ownership rules

| Data | Source | Rationale |
|------|--------|-----------|
| Channel (e.g. `default-channel`) | Sandbox sample data | Always present; read-only in tests |
| Shipping methods | Sandbox sample data | Sufficient for checkout flow; no need to create |
| Existing products (for storefront queries) | Sandbox sample data | Product list/detail queries can use any seeded product |
| Product type & attributes (for Dashboard UI create test) | Sandbox sample data | Rely on pre-seeded types; no need to create |
| Product (for Dashboard UI edit test) | API `productCreate` (beforeAll) | UI test edits a known, controlled product |
| Customer for Draft Order test | Sandbox sample data | Use pre-existing sandbox customer account |
| Staff JWT token | API `tokenCreate` (beforeAll) | Required to authenticate Dashboard session |
| Voucher | Created in UI test itself | The creation flow IS the test |

**Rule:** UI tests never create their own test data through the UI unless the test *is* about the creation flow. Data setup always goes through the API.

### Execution order in CI

API Layer
  │
  ├─ reads sandbox sample data (channels, shipping, products, customers)
  ├─ creates test-owned data (product for UI edit test)
  └─ runs API test suite (fast, no browser)
       │
       └─ UI Layer
            ├─ receives test-owned data references (IDs) from API fixtures
            ├─ authenticates via storageState (staff token from API)
            └─ runs Dashboard test suite
                 │
                 └─ Accessibility Layer
                      └─ scans pages already reachable after UI layer auth is established

---

## 3. Critical Business Flows — Priority Order

| Priority | Flow | Layer | Rationale |
|----------|------|-------|-----------|
| P0 | Checkout: create → add lines → complete | API | Revenue-critical; any regression = lost sales |
| P0 | Product listing & detail query | API | Storefront cannot render without this; affects all users including guests |
| P1 | Customer login (`tokenCreate`) | API | Gates authenticated features, but guest checkout reduces blast radius |
| P1 | Customer registration | API | Top-of-funnel acquisition |
| P1 | Product creation (Dashboard) | UI | Catalog management; blocks all downstream flows |
| P1 | Draft order creation (Dashboard) | UI | Core ops workflow for manual orders |
| P2 | Voucher creation (Dashboard) | UI | Promotional capability |
| P3 | Accessibility baseline | A11y | Compliance risk, not revenue-critical |

> **Rationale for product queries at P0:** Saleor supports guest checkout, meaning unauthenticated customers can complete a purchase. Product listing and detail are therefore on the critical path for 100% of users, while login gates only the authenticated subset.

> **Rationale for Dashboard P1 flows:** Product creation and draft order management are core daily operations for store operators. Breakage here directly blocks catalog updates and manual order handling.

---

## 4. Risks Specific to GraphQL API and React SPA

### GraphQL API Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Schema drift — field removed or renamed between Saleor versions | Silent test breakage | Pin Saleor version in CI; use introspection to validate schema before test run |
| Nullable fields returning `null` unexpectedly | Tests pass on partial data | Assert on specific field values, not just presence |
| Checkout state machine violations — completing a checkout in wrong state | Flaky tests from shared state | Each checkout test creates its own checkout ID; never reuse |
| Rate limiting / token expiry mid-suite | Intermittent auth failures | Centralize token refresh logic; cache staff token per suite, not per test |
| Pagination assumptions — `first: 10` hides data | False positives on list queries | Tests that assert "product X exists" should query by ID, not scan a list |
| Error codes are in `errors[]` not HTTP status | Easy to miss failures | Always assert `data.X.errors` is empty alongside the happy-path assertion |

### React SPA (Dashboard) Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Client-side routing — Playwright navigates before React hydrates | Flaky selectors | Use `waitForSelector` / `waitForResponse` on the GraphQL mutation, not just URL change |
| Optimistic UI — element appears before server confirms | Test asserts uncommitted state | Wait for the POST response (`page.waitForResponse`) before asserting |
| Dynamic class names (MUI/styled-components) | Brittle CSS selectors | Use `data-testid`, `aria-*`, or text-based selectors exclusively |
| Dashboard login session — token stored in localStorage | Tests interfere if parallelised | Use Playwright's `storageState` per worker; never share auth state across tests |
| GraphQL errors surfaced as toast notifications only | Easy to miss in UI tests | Always check for error toasts after mutations (`expect(page.locator('[data-testid="error-toast"]')).not.toBeVisible()`) |
| Saleor Cloud sandbox cold starts / rate limits | Slow or failing tests in CI | Add retry logic at the Playwright level (`retries: 2`); separate smoke vs. full suite |

---

## 5. Framework Success Metrics

### Reliability
- **Flakiness rate < 5%** — a test that fails without a code change more than 1 in 20 runs is a broken test
- **Zero false positives** — no test passes when the feature is broken

### Speed
- API test suite completes in **< 2 minutes**
- Full POC suite (API + UI + A11y) completes in **< 10 minutes**

### Maintainability
- Adding a new test requires touching **≤ 2 files** (the test file + optionally a fixture/helper)
- No hardcoded IDs, URLs, or credentials in test files

### Coverage signal
- Each P0 flow has **≥ 1 passing test** before POC is signed off
- Each P1 flow has **≥ 1 passing test** before POC is signed off

### CI integration
- Tests run on every PR (or at minimum on merge to `main`)
- Failed run **blocks merge** for P0 tests; P1–P3 are advisory only at POC stage

---

## 6. Definition of Done — POC

A POC is done when **all of the following are true:**

### Code & Architecture
- [ ] Repository has a clear folder structure: `tests/api/`, `tests/ui/`, `tests/a11y/`, `lib/` (fixtures, clients, helpers)
- [ ] Single `playwright.config.ts` with projects for `api`, `ui`, and `a11y`
- [ ] Environment variables managed via `.env.example`; no secrets in source
- [ ] GraphQL client wrapper (typed, reusable) used by all API tests
- [ ] `storageState`-based auth fixture for Dashboard tests

### Tests passing in CI against Saleor Cloud sandbox
- [ ] `products` list query — asserts ≥ 1 product returned
- [ ] `product(id)` detail query — asserts name + pricing present
- [ ] Checkout happy path — `checkoutCreate` → `checkoutLinesAdd` → `checkoutComplete` returns `order.id`
- [ ] `accountRegister` + `tokenCreate` — returns valid JWT
- [ ] Dashboard: create product → assert in product list
- [ ] Dashboard: create voucher → assert in voucher list
- [ ] Dashboard: create draft order → assert status = Draft
- [ ] Accessibility: login page — 0 critical axe violations
- [ ] Accessibility: product creation form — 0 critical axe violations

### Documentation
- [ ] `README.md` covers: prerequisites, local run command, env var reference, CI setup
- [ ] Architecture decision: why Playwright for both API and UI (single toolchain rationale)

---

## Executive Summary

This POC establishes a **three-layer, single-toolchain** test framework for Saleor Commerce using Playwright across GraphQL API, Dashboard UI, and Accessibility concerns.

**The core architectural principle** is strict layer separation with a top-down dependency flow: API tests run first and double as data-setup mechanisms for UI tests. No UI test creates its own prerequisite data through the browser — this eliminates the most common source of flakiness in SPA test suites.

**Priority ordering reflects guest checkout reality:** product listing and detail queries are P0 alongside the checkout flow because Saleor supports unauthenticated purchases. Customer login is P1 — important, but its failure affects only a subset of users. Dashboard product creation and draft order management are elevated to P1 as they represent core daily operations for store operators.

**The two highest-priority risks** are checkout state pollution (mitigated by test-scoped checkout IDs) and React SPA timing issues (mitigated by waiting on GraphQL responses rather than DOM transitions). Both are addressed at the framework level, not test-by-test.

**The POC is scoped to 9 tests across 3 layers**, deliberately shallow enough to deliver quickly but structured so that each new test follows an established pattern. The test matrix covers every P0 and P1 business flow — the ones where a regression directly means lost revenue or blocked operators.

**Success is binary:** the POC is done when all 9 tests pass in CI against the Saleor Cloud sandbox, the repo is self-documenting, and a developer unfamiliar with the project can add a test in under 30 minutes using only the README.
