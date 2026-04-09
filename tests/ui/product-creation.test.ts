import { test, expect } from '@playwright/test';

let productId: string;
const timestamp = Date.now();
const productName = `Test Shoe ${timestamp}`;
const productDescription = 'Comfortable everyday shoe, created by automated test';
const materialAttribute = 'Synthetic Leather';

test.describe.serial('Dashboard UI — Create Product and Variant', () => {
  test('creates a new shoe product with category and attributes', async ({ page }) => {
    await page.goto('/dashboard/products');

    // Click "Create Product" button
    await page.getByRole('button', { name: 'Create Product' }).click();

    // Select "Shoe" product type
    const productTypeCombobox = page.getByRole('combobox', { name: 'Product type' });
    await productTypeCombobox.click();
    // Find and click the Shoe option (Playwright retries until found)
    await page.locator('li, div[role="option"]').filter({ hasText: 'Shoe' }).first().click({ timeout: 10000 });
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Wait for the product creation form to load
    await page.waitForURL('/dashboard/products/add**');

    // Fill in product name
    const nameField = page.getByRole('textbox', { name: 'Name' });
    await nameField.fill(productName);

    // Fill in description - find the contenteditable element
    const descriptionEditor = page.locator('[contenteditable]').first();
    await descriptionEditor.waitFor({ state: 'visible', timeout: 10000 });
    await descriptionEditor.click();
    await page.keyboard.type(productDescription);

    // Select category "Apparel / Sneakers"
    const categoryCombobox = page.getByRole('combobox', { name: 'Category' });
    await categoryCombobox.click();
    // Find and click the category option (let Playwright retry as needed)
    await page.locator('li, div[role="option"]').filter({ hasText: 'Apparel / Sneakers' }).first().click({ timeout: 10000 });

    // Set material attribute
    const materialCombobox = page.locator('[id="attribute:Material"]');
    await materialCombobox.click();
    // Find and click the material option in the dropdown
    const materialOption = page.locator('li, div[role="option"]').filter({ hasText: materialAttribute }).first();
    await materialOption.click({ timeout: 10000 });

    // Intercept the product creation response to extract product ID
    const responsePromise = page.waitForResponse((response) => {
      if (response.request().method() !== 'POST') return false;
      try {
        const postData = response.request().postDataJSON();
        return postData?.operationName === 'ProductCreate';
      } catch {
        return false;
      }
    });

    await page.getByRole('button', { name: 'Save' }).click();
    const response = await responsePromise;
    const responseData = await response.json();
    productId = responseData.data.productCreate.product.id;

    // Verify no error toast appeared
    await expect(page.locator('[data-testid="error-toast"]')).not.toBeVisible();

    // Verify we're on the product details page
    await expect(page).toHaveURL(/\/dashboard\/products\/[A-Za-z0-9_=%]+$/);

    // Verify product data is displayed correctly
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(productName);
    await expect(page.locator('[contenteditable]').first()).toContainText(productDescription);
    await expect(page.getByRole('combobox', { name: /Category/ })).toHaveValue('Sneakers');
    // Material attribute is also a combobox with value attribute
    await expect(page.locator('[id="attribute:Material"]')).toHaveValue(materialAttribute);
  });

  test('creates a variant with size 40 and black color', async ({ page }) => {
    // Navigate to product details page (Playwright handles URL encoding)
    await page.goto(`/dashboard/products/${productId}`);

    // Click "Add variant" button
    await page.getByRole('button', { name: 'Add variant' }).click();

    // Wait for variant creation form to load
    await page.waitForURL(/\/variant\/add$/);

    // Select shoe size 40
    const shoeSizeCombobox = page.locator('[id="attribute:Shoe size"]');
    await shoeSizeCombobox.waitFor({ state: 'visible', timeout: 10000 });
    await shoeSizeCombobox.click();
    await page.locator('li, div[role="option"]').filter({ hasText: '40' }).first().click({ timeout: 10000 });

    // Select color black
    const colorCombobox = page.locator('[id="attribute:Color"]');
    await colorCombobox.waitFor({ state: 'visible', timeout: 10000 });
    await colorCombobox.click();
    await page.locator('li, div[role="option"]').filter({ hasText: 'black' }).first().click({ timeout: 10000 });

    // Fill in variant name
    const variantNameField = page.locator('[data-test-id="variant-name-input"]');
    await variantNameField.fill('Size 40 - Black');

    // Click save variant button
    await page.getByRole('button', { name: 'Save variant' }).click();

    // Wait for variant name to appear in page header (confirms save successful)
    await page.locator('[data-test-id="page-header"]').getByText('Size 40 - Black').waitFor({ timeout: 10000 });

    // Verify no error toast appeared
    await expect(page.locator('[data-testid="error-toast"]')).not.toBeVisible();

    // Verify variant data is displayed correctly in the page header
    await expect(page.locator('[data-test-id="page-header"]').getByText('Size 40 - Black')).toBeVisible();
    // Verify variant attributes are set
    await expect(page.locator('[id="attribute:Shoe size"]')).toHaveValue('40');
    await expect(page.locator('[id="attribute:Color"]')).toHaveValue('black');
  });
});
