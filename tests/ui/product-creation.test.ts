import { test, expect } from '@playwright/test';
import { ProductCreationPage } from './page-objects/product-creation.page';

let productId: string;
const timestamp = Date.now();
const productName = `Test Shoe ${timestamp}`;
const productDescription = 'Comfortable everyday shoe, created by automated test';
const materialAttribute = 'Synthetic Leather';

test.describe.serial('Dashboard UI — Create Product and Variant', () => {
  test('creates a new shoe product with category and attributes', async ({ page }) => {
    const productPage = new ProductCreationPage(page);

    await productPage.navigateToCreateProduct();
    await productPage.selectProductType('Shoe');

    // Wait for the product creation form to load
    await page.waitForURL('/dashboard/products/add**');

    await productPage.fillProductName(productName);
    await productPage.fillProductDescription(productDescription);
    await productPage.selectCategory('Apparel / Sneakers');
    await productPage.selectMaterialAttribute(materialAttribute);

    productId = await productPage.saveProduct();

    // Verify no error toast appeared
    await productPage.assertNoErrorToast();

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
    const productPage = new ProductCreationPage(page);
    const variantName = 'Size 40 - Black';

    await productPage.navigateToProduct(productId);
    await productPage.startAddVariant();

    // Select shoe size 40
    await productPage.selectAttributeById('attribute:Shoe size', '40');

    // Select color black
    await productPage.selectAttributeById('attribute:Color', 'black');

    // Fill in variant name
    await productPage.fillVariantName(variantName);

    // Save variant
    await productPage.saveVariant();

    // Wait for variant name to appear in page header (confirms save successful)
    await productPage.waitForVariantPage(variantName);

    // Verify no error toast appeared
    await productPage.assertNoErrorToast();

    // Verify variant data is displayed correctly in the page header
    await expect(page.locator('[data-test-id="page-header"]').getByText(variantName)).toBeVisible();
    // Verify variant attributes are set
    await expect(page.locator('[id="attribute:Shoe size"]')).toHaveValue('40');
    await expect(page.locator('[id="attribute:Color"]')).toHaveValue('black');
  });
});
