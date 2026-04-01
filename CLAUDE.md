# CLAUDE.md — Saleor QA AI Showcase

This file contains instructions for AI assistants working on this project.

---

## Project Overview

A three-layer, single-toolchain QA framework POC for Saleor Commerce (Saleor Cloud sandbox). The framework covers:
- **Layer 1:** GraphQL API tests (Playwright + `graphql-request`)
- **Layer 2:** Dashboard UI tests (Playwright browser)
- **Layer 3:** Accessibility tests (`@axe-core/playwright`)

Full strategy: [QA_STRATEGY.md](QA_STRATEGY.md)  
Technology decisions: [docs/adr/ADR-001-technology-stack.md](docs/adr/ADR-001-technology-stack.md)

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
  api/          # GraphQL API tests — no browser, raw HTTP only
  ui/           # Dashboard UI tests — Playwright browser
  a11y/         # Accessibility scans — axe-core inside Playwright
lib/
  graphql-client.ts   # Typed GraphQL wrapper (used by all API tests)
  api-fixtures.ts     # API setup/teardown helpers
  auth-fixtures.ts    # Staff token creation, storageState management
playwright.config.ts  # Single config with projects: api, ui, a11y
codegen.ts            # graphql-codegen config
.env.example          # Template — no real secrets ever committed
```

---

## Core Rules

### Layer separation — never cross these boundaries

- **API tests** (`tests/api/`): no browser, no `page`, no DOM. Raw GraphQL only.
- **UI tests** (`tests/ui/`): no `graphql-request` calls in the test body. Data setup goes in fixtures via API calls.
- **A11y tests** (`tests/a11y/`): only axe scanning and keyboard navigation. Inherit auth state from the UI layer via `storageState`.

### Data ownership

- Read-only data (channels, shipping methods, sample products, existing customers): use what's already in the Saleor Cloud sandbox.
- Test-owned data (anything mutated, deleted, or whose existence must be guaranteed): create via API in `beforeAll`/`beforeEach`, clean up after the suite.
- **UI tests never create test data through the browser** unless the creation flow itself is what's being tested.

### Selectors

Always use `data-testid`, `aria-*`, or visible text selectors. Never use dynamic CSS class names (MUI/styled-components generate them at runtime).

### Timing

Always call `page.waitForResponse()` on the GraphQL mutation response before asserting in UI tests. Never assert immediately after a click or form submit — the Dashboard uses optimistic UI.

### Authentication

Use Playwright `storageState` per worker for Dashboard auth. Never share auth state across tests or workers. Centralize staff token creation in `lib/auth-fixtures.ts` — one token per suite run, not one per test.

### Checkout isolation

Every checkout test creates its own `checkoutId`. Never reuse checkout IDs between tests — Saleor's checkout state machine will reject out-of-sequence operations.

### Error checking

After every GraphQL mutation, assert that `data.X.errors` is empty. After every Dashboard mutation, assert that no error toast is visible:


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

## CI (GitHub Actions)

- Cache `~/.cache/ms-playwright` to avoid re-downloading browser binaries (~300 MB) on every run.
- Run API layer first, then UI, then A11y (top-down dependency order).
- P0 test failures block merge. P1–P3 are informational.

---

## Definition of Done (POC)

The POC is complete when:
1. All 9 tests above pass in CI against Saleor Cloud sandbox.
2. `README.md` covers prerequisites, local run command, env var reference, and CI setup.
3. A developer unfamiliar with the project can add a new test in under 30 minutes using only the README.
