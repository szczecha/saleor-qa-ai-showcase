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

```bash
npm run lint
```

---

## Project structure

```
tests/
  api/
    products.test.ts              # Product list queries, where-filter assertions
    checkout-delivery.test.ts     # Full checkout flow with shipping delivery
    checkout-click-and-collect.test.ts  # Full checkout flow with click & collect
  ui/                             # Dashboard browser tests (Playwright)
  a11y/                           # Axe-core accessibility scans
lib/
  graphql-client.ts               # Unauthenticated + authenticated GraphQL clients
  checkout-operations.ts          # Reusable checkout GraphQL fragments
  generated/graphql.ts            # Auto-generated types — do not edit by hand
playwright.config.ts              # Three projects: api, ui, a11y
codegen.ts                        # graphql-codegen config
.env.example                      # Environment variable template
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

---

## Adding a new test

1. Create or open a file in the appropriate layer directory (`tests/api/`, `tests/ui/`, `tests/a11y/`).
2. Write the GraphQL operation in the test file (or in `lib/` if shared). Run `npm run codegen` to generate types.
3. Define a typed response interface using the generated types. Pass it as `gqlClient.request<T>()`.
4. Use `test.describe` + `test.beforeAll` for setup, plain `test()` for assertions.

A new test should touch at most 2 files. See `CLAUDE.md` for full conventions.

---

## CI

GitHub Actions runs three steps in order: API → UI → A11y. API (P0) failures block the build. UI and A11y steps are present but skipped until tests are written (`--passWithNoTests` keeps CI green on empty directories). Playwright browser binaries are cached at `~/.cache/ms-playwright` to avoid re-downloading on every run (~300 MB).

When UI tests are added, the `ui` project will gain a `setup` dependency that creates `.auth/staff.json` via the API before browser tests run. The A11y project will depend on `ui` so it inherits the authenticated browser state.
