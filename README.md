# Saleor QA AI Showcase

A three-layer, single-toolchain QA framework POC for [Saleor Commerce](https://saleor.io/) running against a Saleor Cloud sandbox.

| Layer | Scope | Location |
|---|---|---|
| API | GraphQL queries & mutations via raw HTTP | `tests/api/` |
| UI | Dashboard browser flows | `tests/ui/` |
| A11y | Axe-core accessibility scans | `tests/a11y/` |

---

## Prerequisites

- Node.js ≥ 20
- Access to a Saleor Cloud sandbox (GraphQL endpoint + Dashboard URL)
- A staff account on the sandbox

---

## Setup

```bash
npm install
npm run codegen
npx playwright install chromium
```

Copy the environment template and fill in your sandbox values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `SALEOR_API_URL` | Saleor Cloud sandbox GraphQL endpoint |
| `SALEOR_DASHBOARD_URL` | Dashboard base URL |
| `SALEOR_STAFF_EMAIL` | Staff account email |
| `SALEOR_STAFF_PASSWORD` | Staff account password |
| `SALEOR_CHANNEL_USD` | Channel slug (defaults to `default-channel`) |

---

## Running tests

```bash
# All layers (API → UI → A11y)
npm test

# API layer only (no browser)
npm run test:api

# Dashboard UI layer
npm run test:ui

# Accessibility layer
npm run test:a11y
```

HTML report is written to `playwright-report/` after every run (`open: 'never'` in CI).

---

## Regenerating GraphQL types

Types in `lib/generated/graphql.ts` are generated from the live schema. Regenerate whenever you add a new query or mutation, or after a Saleor version upgrade:

```bash
npm run codegen
```

Requires `SALEOR_API_URL` to be set in `.env`.

---

## Type-checking

Requires generated types — run `npm run codegen` first if you haven't already.

```bash
npm run lint
```

---

## Project structure

```
tests/
  setup/
    auth.setup.ts                       # Generates authenticated browser state
  api/
    products.test.ts                    # Product list queries, filtering, assertions
    checkout-delivery.test.ts           # Full checkout flow with shipping delivery
    checkout-click-and-collect.test.ts  # Full checkout flow with click & collect
  ui/
    product-creation.test.ts            # Create product & variant flows
    order-creation.test.ts              # Create draft order flows
    page-objects/
      base.page.ts                      # Shared utilities: GraphQL mutation waiting, error checking
      product-creation.page.ts          # Product creation page object
      order-creation.page.ts            # Order creation page object
  a11y/                                 # Accessibility scans (upcoming)
lib/
  test-data.ts                          # Centralized sandbox item slugs (categories, collections, etc.)
  graphql-client.ts                     # Unauthenticated + authenticated GraphQL clients
  auth-fixtures.ts                      # getStaffToken() — cached staff auth
  checkout-operations.ts                # Reusable checkout GraphQL fragments
  generated/graphql.ts                  # Auto-generated types — do not edit by hand
playwright.config.ts                    # Four projects: setup, api, ui, a11y
codegen.ts                              # graphql-codegen config
.env.example                            # Environment variable template
```

---

## Current test coverage

### API — Products (`tests/api/products.test.ts`)

**Anonymous browse (USD channel)**
- Returns at least one product
- Every product has a name
- Every product has a thumbnail URL
- Every product has a USD price range

**Filtering by category, brand, and material**
- Returns at least one product matching all filters (T-Shirts category + Saleor-Loom brand + cotton material)
- Every product belongs to the T-Shirts category
- Every product has the Saleor-Loom brand reference
- Every product has material: cotton

### API — Checkout (`tests/api/checkout-delivery.test.ts`, `checkout-click-and-collect.test.ts`)

Full checkout lifecycle tested end-to-end via GraphQL mutations:
`checkoutCreate` → `checkoutLinesAdd` → `checkoutEmailUpdate` → address updates → `checkoutDeliveryMethodUpdate` → `transactionInitialize` → `checkoutComplete`

Two delivery variants covered:
- **Standard delivery** — shipping address + shipping method selection
- **Click & collect** — warehouse pickup, no shipping address required

### UI — Product Creation (`tests/ui/product-creation.test.ts`)

Dashboard workflow for creating products with attributes and variants:
- Create a new shoe product with name, description, category, and material attribute
- Create a product variant with shoe size and color attributes
- Verify product and variant data appears correctly in the Dashboard

Uses `ProductCreationPage` page object to encapsulate form interactions and GraphQL mutation waiting.

### UI — Order Creation (`tests/ui/order-creation.test.ts`)

Dashboard workflow for creating draft orders:
- Select channel (USD)
- Add products to order
- Select customer and shipping address
- Set shipping method
- Finalize order and verify status is "Unfulfilled"

Uses `OrderCreationPage` page object with integrated GraphQL mutation waiting via `BasePage.waitForGraphQLMutation()`.

---

## Adding a new test

### API Tests

1. Create a file in `tests/api/`.
2. Write the GraphQL operation (query or mutation). Run `npm run codegen` to generate types.
3. Define a typed response interface using the generated types. Pass it as `gqlClient.request<T>()`.
4. Use `test.describe` + `test.beforeAll` for setup, plain `test()` for assertions.

### UI Tests

1. Create a test file in `tests/ui/` and a corresponding page object in `tests/ui/page-objects/`.
2. Extend `BasePage` in the page object to inherit shared utilities: `waitForGraphQLMutation()`, `assertNoErrorToast()`, `selectFromCombobox()`, `goto()`.
3. Encapsulate browser interactions (clicks, form fills, navigation) in page object methods.
4. Keep assertions in the test body, not in the page object.
5. Use the `/ui-test` skill for detailed patterns: locators, data setup, optimistic UI waits, slug-based queries, page object conventions.

**File count:** A new test should touch at most 3 files: test file, page object, and optionally a new GraphQL operation (if needed). See `CLAUDE.md` for full conventions.

---

## CI

GitHub Actions runs four steps in order: setup → API → UI → A11y.

- **Setup** (`setup` project): Generates authenticated browser state (`.auth/staff.json`) via `tokenCreate` API call. Runs once per job.
- **API** (P0): GraphQL query and mutation tests. Failures block the build.
- **UI** (P1): Dashboard browser tests. Depend on setup project for authenticated state. Pre-loaded via `storageState` in config.
- **A11y** (P3): Accessibility scans. Depend on UI project for authenticated state.

Playwright browser binaries are cached at `~/.cache/ms-playwright` to avoid re-downloading on every run (~300 MB). Each test worker runs ≤ 2 workers in CI to avoid overwhelming the Saleor sandbox.
