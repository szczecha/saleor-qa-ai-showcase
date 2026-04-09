# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

A three-layer, single-toolchain QA framework POC for Saleor Commerce (Saleor Cloud sandbox). The framework covers:
- **Layer 1:** GraphQL API tests (Playwright + `graphql-request`)
- **Layer 2:** Dashboard UI tests (Playwright browser)
- **Layer 3:** Accessibility tests (`@axe-core/playwright`)

Full strategy: [QA_STRATEGY.md](QA_STRATEGY.md)  
Technology decisions: [docs/adr/ADR-001-technology-stack.md](docs/adr/ADR-001-technology-stack.md)

---

## AI Assistant Skills

When writing tests, use these skills to guide implementation:
- **`/ui-test`** — Detailed UI test patterns, locator strategies, data setup (create vs. reuse), slug-based queries, page objects, anti-patterns

---

## Common Commands

```bash
# Setup
npm install                          # Install dependencies
npm run codegen                      # Generate types from live Saleor schema
npx playwright install chromium      # Install Playwright browsers

# Testing
npm test                             # Run all tests (setup → API → UI → A11y)
npm run test:api                     # API layer only
npm run test:ui                      # Dashboard UI layer (requires setup first)
npm run test:a11y                    # Accessibility layer (requires setup first)
npx playwright test --project=setup  # Generate authenticated browser state only
npx playwright test --project=api --grep "checkout"  # Run single test or pattern

# Debugging
npm run lint                         # Type-check code (requires codegen first)
npx playwright test --project=api --debug            # Open Playwright Inspector
npx playwright codegen https://saleor.io             # Generate selectors (external site example)
```

---

## Technology Stack

Do not deviate from these choices. They are documented decisions, not defaults.

| Concern | Tool |
|---|---|
| Test runner + browser | Playwright |
| GraphQL client | `graphql-request` |
| Accessibility scanning | `@axe-core/playwright` |
| Type generation | `graphql-codegen` |
| Language | TypeScript |
| Environment | `dotenv` |
| CI | GitHub Actions |
| Assertions | Playwright built-in `expect` only |

Do **not** introduce: Apollo Client, urql, Jest, Mocha, Cypress, Chai, or visual regression tools (Percy, Chromatic).

---

## Repository Structure

```
tests/
  setup/
    auth.setup.ts                       # Playwright setup project — generates .auth/staff.json
  api/
    products.test.ts                    # Product list & filter queries (P0)
    checkout-delivery.test.ts           # Checkout + shipping workflow (P0)
    checkout-click-and-collect.test.ts  # Checkout + pickup workflow (P0)
  ui/               # Dashboard UI tests — empty, awaiting implementation
  a11y/             # Accessibility scans — empty, awaiting implementation
  .auth/            # Generated authenticated browser state (added to .gitignore)
    staff.json      # Saved storageState for authenticated Dashboard access
lib/
  test-data.ts              # SANDBOX_SLUGS: centralized sandbox item slugs (categories, collections, etc.)
  graphql-client.ts         # Unauthenticated + authenticated GraphQL clients
  auth-fixtures.ts          # getStaffToken() — cached staff auth per suite run
  checkout-operations.ts    # Shared checkout GraphQL fragments & mutations
  generated/graphql.ts      # Auto-generated types from Saleor schema (do not edit)
playwright.config.ts  # Single config with projects: setup, api, ui, a11y
codegen.ts            # graphql-codegen config — introspects live SALEOR_API_URL
.env.example          # Environment variable template
```

**lib/ pattern:** Shared GraphQL operations, fragments, and setup helpers live here. Anything used by more than one test file or needed for multi-test setup goes in lib/. This keeps tests focused and avoids duplication. New utility functions should go here, not in individual test files.

---

## Core Rules

### Layer separation — never cross these boundaries

- **API tests** (`tests/api/`): no browser, no `page`, no DOM. Raw GraphQL only.
- **UI tests** (`tests/ui/`): no `graphql-request` calls in the test body. Data setup goes in fixtures via API calls. See `/ui-test` skill for detailed patterns.
- **A11y tests** (`tests/a11y/`): only axe scanning and keyboard navigation. Inherit auth state from the UI layer via `storageState`.

### Data ownership

- Read-only data (channels, shipping methods, sample products, existing customers): use what's already in the Saleor Cloud sandbox.
- Test-owned data (anything mutated, deleted, or whose existence must be guaranteed): create via API in `beforeAll`/`beforeEach`, clean up after the suite.
- **UI tests never create test data through the browser** unless the creation flow itself is what's being tested. See `/ui-test` skill for the two data setup patterns (create vs. reuse) and slug-based queries.

### Selectors (UI tests)

Use semantic locators in this priority order: `getByRole()` → `getByLabel()` → `getByPlaceholder()` → `getByText()` → `getByTestId()`. Never use dynamic CSS class names (MUI/styled-components generate them at runtime). See `/ui-test` skill for detailed locator strategy and examples.

### Timing (UI tests)

Always call `page.waitForResponse()` on the GraphQL mutation response before asserting. Never assert immediately after a click or form submit — the Dashboard uses optimistic UI. See `/ui-test` skill for the optimistic UI pattern and timing rules.

### Authentication

Dashboard auth uses Playwright `storageState`. UI and A11y projects load authenticated state automatically from `.auth/staff.json` before running. The `setup` project (run first by default) generates this state file by:
1. Calling `tokenCreate` GraphQL mutation via API (no browser)
2. Injecting the refreshToken into browser localStorage
3. Saving the authenticated browser state to `.auth/staff.json`

This ensures a single, efficient login that's reused across all UI/A11y tests. Never manually log in during UI tests — the auth state is pre-loaded.

### Checkout isolation

Every checkout test creates its own `checkoutId`. Never reuse checkout IDs between tests — Saleor's checkout state machine will reject out-of-sequence operations.

### Error checking

**API tests:** After every GraphQL mutation, assert that `data.X.errors` is empty:
```ts
expect(data.tokenCreate.errors).toHaveLength(0);
```

**UI tests:** After every Dashboard mutation, assert that no error toast is visible before making further assertions. See `/ui-test` skill for the error checking pattern.

This is non-negotiable — mutations can appear to succeed but actually fail at the server level.


### No hardcoded values in tests

No hardcoded IDs, URLs, or credentials in test files. All environment-specific values go in `.env` (loaded via `dotenv`) and referenced through typed config.

---

## Test Priority

| Priority | Test | Layer |
|---|---|---|
| P0 | `products` list query | API |
| P0 | `product(id)` detail query | API |
| P0 | Checkout: `checkoutCreate` → `checkoutLinesAdd` → `checkoutComplete` | API |
| P1 | Customer: `accountRegister` + `tokenCreate` | API |
| P1 | Dashboard: create product type + product, assert in list | UI |
| P1 | Dashboard: create draft order, assert status = Draft | UI |
| P2 | Dashboard: create percentage voucher, assert in list | UI |
| P3 | Accessibility: login page — 0 critical axe violations | A11y |
| P3 | Accessibility: product creation form — 0 critical axe violations | A11y |

P0 failures must block CI. P1–P3 are advisory at POC stage.

---

## Success Metrics

- Flakiness rate < 5%
- API suite < 2 minutes
- Full suite (API + UI + A11y) < 10 minutes
- Adding a new test touches ≤ 2 files
- No false positives (test passes when feature is broken)

---

## GraphQL Codegen

Run `graphql-codegen` before writing new queries or mutations. All GraphQL operations must use generated TypeScript types — no `any` for GraphQL variables or responses.

The codegen config introspects from the live Saleor Cloud sandbox URL set in `SALEOR_API_URL`.

---

## GraphQL Query Rules

### No deprecated fields

Never use fields marked `@deprecated` in the generated types. Check `lib/generated/graphql.ts` for the replacement before writing a query. Common Saleor deprecations:

| Deprecated | Use instead |
|---|---|
| `product.attributes` | `product.assignedAttributes` |
| `product.attribute(slug)` | `product.assignedAttribute(slug)` |
| `product.images` | `product.media` |
| `availableForPurchase` | `availableForPurchaseAt` |

If TypeScript reports `@deprecated` on a field access, treat it as a hard error — find and use the replacement.

### Always pass `first` / `last` on paginated fields

Every connection field (anything returning `XCountableConnection` or `XCountableEdge`) must include a `first` or `last` argument. Never query an unbounded list. Default page size for test assertions: `first: 20` unless the test specifically needs a different window.

### Typed response interfaces

Every `gqlClient.request<T>()` call must supply a concrete `interface T` for the response shape — never use `any` or omit the type parameter. Define the interface in the same file as the query, using types imported from `lib/generated/graphql`.

---

## Environment Variables

Required variables (define in `.env`, template in `.env.example`):

```
SALEOR_API_URL=          # Saleor Cloud sandbox GraphQL endpoint
SALEOR_DASHBOARD_URL=    # Dashboard base URL
SALEOR_STAFF_EMAIL=      # Staff account email
SALEOR_STAFF_PASSWORD=   # Staff account password
```

Never commit `.env`. Never hardcode these values anywhere in the codebase.

---

## Playwright Configuration

Key settings in `playwright.config.ts` that affect test behavior:

- **`fullyParallel: true`** — Tests run in parallel within each project. Tests in different projects (setup, api, ui, a11y) run sequentially per the order in the config.
- **`workers: 2` (CI) / undefined (local)** — CI limits to 2 workers to avoid overwhelming the Saleor sandbox. Locally, Playwright uses all CPUs.
- **`retries: 1` (CI) / 0 (local)** — CI retries flaky tests once. Locally, tests fail immediately (faster feedback).
- **`trace: 'on-first-retry'`** — Playwright captures a trace file (DOM, network, screenshots) only on the first retry, not on success.
- **`setup` project** — Runs first. Generates `.auth/staff.json` by authenticating via API and saving browser state.
- **`storageState: '.auth/staff.json'` (ui, a11y)** — UI and A11y projects load authenticated browser state from this file. The `setup` project creates it.
- **`dependencies: ['setup']` (ui, a11y)** — UI and A11y projects wait for the setup project to complete before running.

---

## Authentication Setup

**For UI and A11y tests to run, authenticated browser state must exist at `.auth/staff.json`.**

The setup is **automated**:
1. **Setup project runs first** (`tests/setup/auth.setup.ts`):
   - Calls the `tokenCreate` GraphQL mutation via `gqlClient` (unauthenticated, no browser)
   - Extracts the **refreshToken** from the response
   - Creates a browser context and navigates to the Dashboard
   - Injects the refreshToken into localStorage under the key `_saleorRefreshToken`
   - Saves the authenticated browser state to `.auth/staff.json` using `context.storageState()`
   - Closes the context (no browser left behind)

2. **UI and A11y projects load the state**:
   - `storageState: '.auth/staff.json'` in `playwright.config.ts` auto-loads the state
   - Each test worker gets the authenticated browser pre-loaded (no login in tests)

3. **Cache invalidation**:
   - Delete `.auth/staff.json` and re-run `npm test` to regenerate
   - The setup project always creates a fresh token on each run (not cached between runs)

**Key implementation details:**
- Setup uses `refreshToken` (not `token`) — the Dashboard expects `_saleorRefreshToken` in localStorage
- See `tests/setup/auth.setup.ts` for the full implementation
- See `lib/auth-fixtures.ts` for token caching within test suites (different from setup token generation)

---

## Troubleshooting

**Type generation fails with "Cannot find module" or schema error**
- Ensure `SALEOR_API_URL` is set in `.env` and points to a live Saleor GraphQL endpoint.
- Run `npm run codegen` again.
- If the endpoint is unreachable, codegen will hang. Kill it (`Ctrl+C`) and check the URL.

**Setup project fails during token creation**
- Check that `SALEOR_API_URL` is correct and the GraphQL endpoint is reachable
- Verify `SALEOR_STAFF_EMAIL` and `SALEOR_STAFF_PASSWORD` are valid staff credentials
- Run the setup project in isolation to see detailed error logs: `npx playwright test --project=setup --reporter=list`

**Tests fail with `graphql-request` errors or 401 Unauthorized**
- For API tests: Verify `SALEOR_API_URL` in `.env`.
- For authenticated API calls: Check that `getStaffToken()` succeeded; see test output for token creation errors.
- Staff credentials (`SALEOR_STAFF_EMAIL`, `SALEOR_STAFF_PASSWORD`) may be stale or incorrect.

**UI/A11y tests fail immediately with "Could not find a browser instance"**
- `.auth/staff.json` is missing or stale. Regenerate by running the setup project: `npx playwright test --project=setup`
- Or run `npm test` to generate the file automatically before UI tests run.
- If setup fails, check that `SALEOR_STAFF_EMAIL` and `SALEOR_STAFF_PASSWORD` are correct in `.env`.

**Tests timeout or hang**
- Check `playwright.config.ts` for timeout settings (default 30s per test).
- If a test hangs on `page.waitForResponse()`, the mutation may have failed silently. Add logging before the wait:
  ```ts
  console.log('Sending mutation...');
  const response = page.waitForResponse(/* ... */);
  // mutation logic
  await response;
  ```

**Flaky tests (pass sometimes, fail sometimes)**
- Ensure all assertions use Playwright's `expect()`, not plain JavaScript `assert()` — `expect()` auto-retries.
- Always call `page.waitForResponse()` before asserting mutations in UI tests (Dashboard uses optimistic UI).
- Check that test data is properly isolated — never reuse checkout IDs or test-created resources.

---

## CI (GitHub Actions)

- Cache `~/.cache/ms-playwright` to avoid re-downloading browser binaries (~300 MB) on every run.
- Run in order: setup → API → UI → A11y (project dependencies enforce this automatically).
- The setup project runs once per CI job and generates `.auth/staff.json` for all subsequent UI/A11y tests.
- P0 test failures block merge. P1–P3 are informational.

---

## Definition of Done (POC)

The POC is complete when:
1. All 9 tests above pass in CI against Saleor Cloud sandbox.
2. `README.md` covers prerequisites, local run command, env var reference, and CI setup.
3. A developer unfamiliar with the project can add a new test in under 30 minutes using only the README.
