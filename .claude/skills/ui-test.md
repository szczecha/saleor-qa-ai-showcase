# UI Test Skill — Saleor Dashboard (Playwright)

This skill guides writing UI tests for the Saleor Dashboard in this POC. Tests live in `tests/ui/` and share authenticated browser state via `.auth/staff.json` (pre-loaded by the setup project).

---

## Layer Separation (Non-Negotiable)

**DO:**
- Use `graphql-request` for data setup in `beforeAll` / `beforeEach` only
- Keep test bodies focused on browser interactions and assertions
- Import reusable GraphQL operations from `lib/`

**DON'T:**
- Call `gqlClient.request()` inside `test()` bodies
- Create test data through the browser unless testing the creation flow itself
- Mix API and UI concerns in a single test file

**Example:**
```typescript
// ✓ Correct: setup via API, test via browser
let productId: string;

test.beforeAll(async () => {
  const data = await gqlClient.request<CreateProductResponse>(CREATE_PRODUCT, {...});
  productId = data.productCreate.product!.id;
});

test('displays product in list', async ({ page }) => {
  await page.goto('/products');
  await expect(page.locator(`[data-testid="product-${productId}"]`)).toBeVisible();
});

// ✗ Wrong: API call inside test
test('create product', async ({ page }) => {
  const data = await gqlClient.request(CREATE_PRODUCT, {...}); // ✗ Layer violation
  // ...
});
```

---

## Locator Priority (In Order)

1. **`getByRole()`** — semantic (buttons, links, headings, inputs by accessible label)
2. **`getByLabel()`** — form inputs with associated `<label>`
3. **`getByPlaceholder()`** — form inputs by placeholder text
4. **`getByText()`** — elements by visible text content
5. **`getByTestId()`** — fallback when semantic locators unavailable (use `data-testid` attribute)

**DO:**
- Chain multiple filters: `page.getByRole('button', { name: /save/i })`
- Use regex for case-insensitive matching: `{ name: /delete|remove/i }`

**DON'T:**
- Use dynamic CSS class names (MUI/styled-components generate them at runtime)
- Reach for `.nth(0)` or `.first()` without a documented positional contract
- Chain complex CSS selectors: `page.locator('.container > div > span.text')`
- Use XPath unless the page lacks accessible markup

**Example:**
```typescript
// ✓ Correct: semantic and stable
const saveButton = page.getByRole('button', { name: /save/i });
const emailInput = page.getByLabel('Email');
const productLink = page.getByText(/^Product Name$/);
const submitButton = page.getByTestId('form-submit');

// ✗ Wrong: dynamic classes, nth abuse
const btn = page.locator('.css-a1b2c3 button').first();
const input = page.locator('input.jss-34 ~ label');
```

---

## Optimistic UI — Always Wait on Response

The Saleor Dashboard renders changes optimistically before the server confirms. **Never assert immediately after a click or form submit.**

**Pattern: Using BasePage Helper (Recommended)**

Extend `BasePage` in your page objects to use the built-in `waitForGraphQLMutation()` helper:

```typescript
import { BasePage } from './base.page';

class ProductPage extends BasePage {
  async saveProduct() {
    const mutationPromise = this.waitForGraphQLMutation('ProductCreate');
    await this.page.getByRole('button', { name: /save/i }).click();
    await mutationPromise; // Waits for response with operationName='ProductCreate'
  }
}

// In test:
const productPage = new ProductPage(page);
productId = await productPage.saveProduct();
```

**Pattern: Direct waitForResponse (If Mutation Name Unknown)**

When mutation operation name is not available, use `waitForAnyGraphQLMutation()`:

```typescript
const mutationPromise = this.waitForAnyGraphQLMutation();
await this.page.getByRole('button', { name: /confirm/i }).click();
await mutationPromise;
```

**Manual Pattern (Legacy):**

```typescript
const responsePromise = page.waitForResponse(response => 
  response.url().includes('graphql') && 
  response.status() === 200
);

// Trigger the mutation
await page.getByRole('button', { name: /save/i }).click();

// Wait for the GraphQL response
const response = await responsePromise;
const data = await response.json();

// Now assert the result
await expect(page.locator('[role="alert"]')).not.toBeVisible();
await expect(page.getByText(/success|saved/i)).toBeVisible();
```

**Key Rule:** If the test races the UI, it becomes flaky. Wait first, assert second.

---

## Error Checking (Mandatory)

After every mutation in UI tests:

1. **Check for error toasts** before making further assertions:
   ```typescript
   await expect(page.locator('[role="alert"]')).not.toBeVisible();
   ```

2. **Don't assume the mutation succeeded** — the Dashboard can hide GraphQL errors in toasts or form fields.

3. **Verify the expected positive state** (new item in list, form field cleared, redirect completed).

**Example:**
```typescript
const createButton = page.getByRole('button', { name: /create/i });
const responsePromise = page.waitForResponse(r => r.url().includes('graphql'));

await createButton.click();
await responsePromise;

// Always check for errors first
await expect(page.locator('[role="alert"]:has-text("Error")')).not.toBeVisible();

// Then assert the expected outcome
await expect(page.getByText(/product created/i)).toBeVisible();
```

---

## Data Setup (beforeAll / beforeEach)

### Two Patterns: Create vs. Reuse

**For modify/delete tests — create fresh fixtures via API:**
- Tests that edit, delete, or change state need isolated data
- Create via API in `beforeAll`; data is test-owned and must persist until the test runs
- Clean up after the suite if necessary

**For creation tests — reuse existing sandbox data:**
- Tests that create new products, orders, etc. should build on pre-seeded data
- Sandbox always has: channels (default-channel), shipping methods, product types, warehouses, categories, collections
- Query these once in `beforeAll` to get their IDs; reference them in the test

**DO:**
- Query sandbox data once in `beforeAll` (channels, shipping methods, product types, warehouses)
- Create only the immediate parent(s) via API if they don't exist (e.g., a customer for draft order tests)
- Store IDs as test-scoped variables
- Clean up test-created data after the suite if mutated/deleted

**DON'T:**
- Recreate sandbox data — it's already there and read-only
- Create test data inside the test body
- Assume previous tests' data still exists
- Query all products/orders looking for test data — use IDs

**Example 1: Create product (reuse sandbox data):**
```typescript
let productTypeId: string;
let channelId: string;

test.beforeAll(async () => {
  // Query sandbox: get first product type and default channel
  const typesRes = await gqlClient.request<GetProductTypesResponse>(
    GET_PRODUCT_TYPES,
    { first: 1 }
  );
  productTypeId = typesRes.productTypes.edges[0].node.id;

  const channelsRes = await gqlClient.request<GetChannelsResponse>(
    GET_CHANNELS,
    { first: 1 }
  );
  channelId = channelsRes.channels[0].id;
});

test('create product and verify in list', async ({ page }) => {
  await page.goto('/products/create');
  await page.getByLabel('Product Name').fill('Test Product');
  // (reused productTypeId and channelId from sandbox)
  // ...
});
```

**Example 2: Edit product (create fixture, then test):**
```typescript
let productId: string;

test.beforeAll(async () => {
  // Create a fresh product to test editing
  const res = await gqlClient.request<CreateProductResponse>(
    CREATE_PRODUCT,
    { input: { name: `Product-${Date.now()}`, productType: '...', } }
  );
  productId = res.productCreate.product!.id;
});

test('edit product name and verify', async ({ page }) => {
  await page.goto(`/products/${productId}`);
  const nameInput = page.getByLabel('Product Name');
  await nameInput.clear();
  await nameInput.fill('Updated Name');
  // waitForResponse + error check + assert
});
```

**Example 3: Create draft order (reuse customer, create order):**
```typescript
let customerId: string;
let draftOrderId: string;

test.beforeAll(async () => {
  // Query sandbox: get first existing customer
  const customersRes = await gqlClient.request<GetCustomersResponse>(
    GET_CUSTOMERS,
    { first: 1 }
  );
  customerId = customersRes.customers.edges[0].node.id;

  // Create the draft order (test-owned)
  const draftRes = await gqlClient.request<CreateDraftOrderResponse>(
    CREATE_DRAFT_ORDER,
    { customerId, input: {...} }
  );
  draftOrderId = draftRes.draftOrderCreate!.order!.id;
});

test('displays draft order in list with correct status', async ({ page }) => {
  await page.goto('/orders');
  await expect(page.getByText(draftOrderId)).toBeVisible();
  await expect(page.getByText(/Draft/)).toBeVisible();
});
```

### Querying Sandbox Data by Slug

When you need the ID of a sandbox item (category, collection, product type, etc.), **query by slug**. Store slugs in a centralized test data file, not hardcoded in tests.

**Why:** Sandbox data may be reordered or changed between runs. Querying by slug is reliable and self-documenting.

**File structure:**
```
lib/test-data.ts  # Centralized sandbox slug references
```

**Content:**
```typescript
// lib/test-data.ts
export const SANDBOX_SLUGS = {
  category: {
    clothing: 'clothing',      // Known category slug in sandbox
    electronics: 'electronics',
  },
  collection: {
    featured: 'featured-products',
  },
  productType: {
    apparel: 'apparel',
    digital: 'digital-goods',
  },
};
```

**Query pattern in tests:**
```typescript
import { SANDBOX_SLUGS } from '../lib/test-data';

let categoryId: string;

test.beforeAll(async () => {
  // Query by slug to get the ID
  const res = await gqlClient.request<GetCategoryResponse>(GET_CATEGORY, {
    slug: SANDBOX_SLUGS.category.clothing,
  });
  categoryId = res.category!.id;
});

test('assign product to category', async ({ page }) => {
  await page.goto(`/products/create`);
  // Use categoryId from beforeAll, not the slug
  // ...
});
```

**GraphQL query example:**
```typescript
// lib/graphql/categories.ts
export const GET_CATEGORY = gql`
  query GetCategory($slug: String!) {
    category(slug: $slug) {
      id
      name
      slug
    }
  }
`;

// Same pattern for collections, product types, warehouses, etc.
export const GET_COLLECTION = gql`
  query GetCollection($slug: String!) {
    collection(slug: $slug) {
      id
      name
    }
  }
`;

export const GET_PRODUCT_TYPE = gql`
  query GetProductType($slug: String!) {
    productType(slug: $slug) {
      id
      name
    }
  }
`;
```

**DO:**
- Store sandbox slugs in `lib/test-data.ts` (single source of truth)
- Query by slug in `beforeAll` to get IDs
- Reference the ID in your test, not the slug
- Document the slug's purpose (e.g., `clothing: 'clothing'  // Known category in sandbox`)

**DON'T:**
- Hardcode slugs directly in test files
- Query by `first: 1` and assume order
- Assume the slug matches a test name or variable name

---

## Timing & Waits (No Timeouts)

**DO:**
- Wait on explicit UI state: `page.waitForSelector()`, `locator.isVisible()`
- Use Playwright's auto-wait (default 30s timeout per action)
- Assert meaningful conditions, not just presence

**DON'T:**
- Use `await page.waitForTimeout(1000)` (banned — masks timing bugs)
- Sleep between interactions
- Retry manually with loops; let Playwright's `expect()` auto-retry

**Example:**
```typescript
// ✓ Correct: wait on state
const newProduct = page.getByText('Product Name');
await expect(newProduct).toBeVisible(); // auto-retries for 30s

// ✗ Wrong: arbitrary sleep
await page.waitForTimeout(2000); // ✗ Banned

// ✗ Wrong: manual retry loop
for (let i = 0; i < 3; i++) {
  if (await page.getByText('Product Name').isVisible()) break;
  await page.waitForTimeout(500);
}
```

---

## Selectors Before Writing Code

Before writing any test, use the Playwright MCP or Inspector to explore the Dashboard UI:

1. **Open the Dashboard** in the browser or Inspector
2. **Navigate to the target page** (e.g., product creation form)
3. **Inspect accessible markup** — use the browser's accessibility tree to find stable locators
4. **Document the contract** — note which role/label/testid is stable across renders

**Example workflow:**
```
1. Open Inspector: npx playwright codegen https://dashboard-url.com
2. Navigate to /products/create
3. Find the form:
   - Input: getByLabel('Product Name')
   - Select: getByLabel('Product Type')
   - Button: getByRole('button', { name: /save/i })
4. Write the test using these locators
```

---

## Page Objects (Recommended Pattern)

All page objects should **extend `BasePage`** to inherit shared utilities: `waitForGraphQLMutation()`, `assertNoErrorToast()`, `selectFromCombobox()`, and `goto()`.

**DO:**
- Extend `BasePage` for access to mutation waiting and error checking helpers
- Expose **intent-level methods** (`fillProductName()`, `createProduct()`, `goToProductList()`)
- **Hide implementation details** — locators are private to the page object
- Keep methods focused — one user action per method
- Use `waitForGraphQLMutation(operationName)` for known mutations
- Call `assertNoErrorToast()` after mutations before returning

**DON'T:**
- Store mutable state across navigations
- Put test data inside Page Objects (use test fixtures/beforeAll)
- Create generic "click" or "fill" helpers — too low-level
- Mix API calls into Page Objects
- Duplicate GraphQL mutation waiting logic — use BasePage helpers

**Example: ProductCreationPage**
```typescript
import { BasePage } from './base.page';

export class ProductCreationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigateToCreateProduct() {
    await this.goto('/products');
    await this.page.getByRole('button', { name: 'Create Product' }).click();
  }

  async selectProductType(productType: string) {
    await this.selectFromCombobox('Product type', productType);
    await this.page.getByRole('button', { name: 'Confirm' }).click();
  }

  async fillProductName(name: string) {
    await this.page.getByRole('textbox', { name: 'Name' }).fill(name);
  }

  async saveProduct() {
    const mutationPromise = this.waitForGraphQLMutation('ProductCreate');
    await this.page.getByRole('button', { name: 'Save' }).click();
    await mutationPromise;
    await this.assertNoErrorToast();
    const response = await mutationPromise;
    const responseData = await response.json();
    return responseData.data.productCreate.product.id;
  }
}

// Usage in test:
const productPage = new ProductCreationPage(page);
await productPage.navigateToCreateProduct();
await productPage.selectProductType('Shoe');
await productPage.fillProductName('Test Product');
const productId = await productPage.saveProduct();
```

**Example: OrderCreationPage**
```typescript
import { BasePage } from './base.page';

export class OrderCreationPage extends BasePage {
  async navigateToOrders(dashboardUrl: string) {
    await this.page.goto(`${dashboardUrl}/orders`);
  }

  async selectChannel(channelName: string) {
    const channelInput = this.page.locator('input[data-test-id="channel-autocomplete"]');
    await channelInput.click();
    await this.page.locator('li').filter({ hasText: channelName }).click();

    const mutationPromise = this.waitForGraphQLMutation('OrderDraftCreate');
    await this.page.getByRole('button', { name: 'Confirm' }).first().click();
    await mutationPromise;
  }

  async addProducts(productCount: number = 2) {
    await this.page.getByRole('button', { name: 'Add products' }).click();
    const firstCheckbox = this.page.locator('table tbody tr').first().locator('input[type="checkbox"]');
    await firstCheckbox.check();

    for (let i = 1; i < productCount; i++) {
      await this.page.locator('table tbody tr').nth(i + 1).locator('input[type="checkbox"]').check();
    }

    const mutationPromise = this.waitForGraphQLMutation('OrderLinesAdd');
    await this.page.getByRole('button', { name: 'Confirm' }).first().click();
    await mutationPromise;
  }
}

// Usage in test:
const orderPage = new OrderCreationPage(page);
await orderPage.navigateToOrders(dashboardUrl);
await orderPage.selectChannel('Channel-USD');
await orderPage.addProducts(2);
// Assertions remain in test body:
await expect(page.getByText('Unfulfilled')).toBeVisible();
```

**BasePage Shared Utilities:**

| Method | Purpose |
|---|---|
| `waitForGraphQLMutation(operationName)` | Wait for GraphQL mutation by operation name (e.g., `'ProductCreate'`) |
| `waitForAnyGraphQLMutation()` | Wait for any POST to graphql endpoint (when mutation name is unknown) |
| `assertNoErrorToast()` | Assert error toast is not visible |
| `selectFromCombobox(label, optionText)` | Select from accessible combobox by label |
| `selectFromComboboxById(id, optionText)` | Select from combobox by ID (for attribute dropdowns) |
| `goto(path)` | Navigate to Dashboard path (e.g., `/products`) |

---

## Anti-Patterns (Banned)

| Anti-pattern | Why | Fix |
|---|---|---|
| `page.waitForTimeout()` | Masks timing bugs; makes flaky tests slower | Use `waitForSelector()`, `waitForResponse()` or `waitForGraphQLMutation()`, or `expect().toBeVisible()` |
| `.first()` / `.nth()` without contract | Brittle to UI reordering; assumes order | Use semantic locators or `getByRole()` with name filters; query by slug |
| Hardcoded IDs or URLs | Breaks on schema changes | Use env vars (`SALEOR_DASHBOARD_URL`) and dynamic IDs from API |
| Hardcoded slugs in tests | Slugs must be centralized for maintainability | Store slugs in `lib/test-data.ts`; import and reference from there |
| Querying by `first: 1` to get ID | Assumes first item exists or is the right one | Query by slug using `category(slug: "...")`, `collection(slug: "...")`, etc. |
| `graphql-request` in test body | Violates layer separation | Move to `beforeAll` / `beforeEach` |
| Assertion without error check | Mutations can fail silently | Always check error toasts first with `assertNoErrorToast()` |
| Reusing test data between tests | Creates order dependencies | Use `beforeAll` to seed each test independently |
| Manual login in UI tests | Auth state pre-loaded; wastes time | Use `storageState` (auto-loaded from `.auth/staff.json`) |
| Duplicating `waitForResponse()` logic in tests | Error-prone and unreadable | Extend `BasePage` and use `waitForGraphQLMutation(operationName)` |
| Assertions hidden in page objects | Hides test intent; makes debugging harder | Keep assertions in test body; page objects focus on interactions only |
| Page objects calling API (`gqlClient`) | Violates layer separation | Data setup goes in test's `beforeAll`; page objects are UI-only |
| Hardcoding combobox/dropdown selectors | Fragile to UI changes | Use `selectFromCombobox()` or `selectFromComboboxById()` from `BasePage` |

---

## File Organization

```
tests/ui/
  product-creation.test.ts    # Product creation and variant flows
  order-creation.test.ts      # Draft order creation, status updates
  [feature].test.ts           # One test file per feature area
  page-objects/
    base.page.ts              # Shared utilities: waitForGraphQLMutation, selectFromCombobox, etc.
    product-creation.page.ts  # Page object for product creation flows
    order-creation.page.ts    # Page object for order creation flows
    [feature].page.ts         # One page object per test file (as needed)

lib/
  test-data.ts                # SANDBOX_SLUGS: centralized slugs for categories, collections, etc.
  graphql/
    products.ts               # Product mutations (CREATE_PRODUCT, UPDATE_PRODUCT, etc.)
    orders.ts                 # Order mutations (CREATE_DRAFT_ORDER, etc.)
    vouchers.ts               # Voucher mutations
    categories.ts             # Category queries (GET_CATEGORY by slug, etc.)
    collections.ts            # Collection queries (GET_COLLECTION by slug, etc.)
```

**Rule:** A new test should touch ≤ 3 files:
1. The test file (`tests/ui/[feature].test.ts`)
2. The page object (optional, `tests/ui/page-objects/[feature].page.ts`)
3. A new GraphQL operation (if needed, in `lib/graphql/`)

**Page Object Hierarchy:**
- All page objects inherit from `BasePage` (`tests/ui/page-objects/base.page.ts`)
- `BasePage` provides utilities for mutation waiting, error checking, form selection, and navigation
- Feature-specific page objects extend `BasePage` with domain methods

**Slug queries:** Always reference slugs from `lib/test-data.ts`, never hardcode them in tests.

---

## Quick Checklist

Before submitting a UI test:

**Page Objects & Mutations:**
- [ ] Page object extends `BasePage` to inherit shared utilities
- [ ] Mutations use `waitForGraphQLMutation(operationName)` from BasePage
- [ ] `assertNoErrorToast()` called after mutations before returning
- [ ] Assertions remain in test body, not hidden in page objects

**Locators & Selectors:**
- [ ] All locators use `getByRole()`, `getByLabel()`, `getByTestId()` — no CSS classes
- [ ] Combobox selection uses `selectFromCombobox()` or `selectFromComboboxById()` from BasePage
- [ ] No `.first()/.nth()` without documented positional contract
- [ ] No `waitForTimeout()`, hardcoded IDs, or dynamic class names

**Data & Auth:**
- [ ] Data setup via API in `beforeAll`, not in test body
- [ ] `storageState` pre-loads auth — no manual login in tests
- [ ] Test data is isolated per suite (don't share between tests)

**File Organization:**
- [ ] Test file uses page objects (not inline interactions)
- [ ] Page objects live in `tests/ui/page-objects/`
- [ ] Each test file has one corresponding page object (e.g., `product-creation.test.ts` ↔ `product-creation.page.ts`)
- [ ] GraphQL operations imported from `lib/graphql/`, not inline
- [ ] Each test file covers one feature area

**Test Quality:**
- [ ] Tests run in any order and don't share state
- [ ] Slug data comes from `lib/test-data.ts`, never hardcoded
- [ ] All GraphQL mutations are awaited with response waiting
- [ ] Error state is checked before positive assertions

---

## See Also

- `CLAUDE.md` — Full project constraints and rules
- `QA_STRATEGY.md` — Why each layer matters, priority ranking
- `tests/setup/auth.setup.ts` — How storageState is generated
- `lib/graphql-client.ts` — Authenticated and unauthenticated GraphQL clients
