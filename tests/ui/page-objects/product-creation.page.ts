import { Page } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Product creation page object.
 * Handles product form interactions and mutations.
 */
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

  async fillProductDescription(description: string) {
    const descriptionEditor = this.page.locator('[contenteditable]').first();
    await descriptionEditor.waitFor({ state: 'visible', timeout: 10000 });
    await descriptionEditor.click();
    await this.page.keyboard.type(description);
  }

  async selectCategory(category: string) {
    await this.selectFromCombobox('Category', category);
  }

  async selectMaterialAttribute(material: string) {
    await this.selectFromComboboxById('attribute:Material', material);
  }

  async saveProduct() {
    const mutationPromise = this.waitForGraphQLMutation('ProductCreate');
    await this.page.getByRole('button', { name: 'Save' }).click();
    const response = await mutationPromise;
    const responseData = await response.json();
    return responseData.data.productCreate.product.id;
  }

  async navigateToProduct(productId: string) {
    await this.goto(`/products/${productId}`);
  }

  async startAddVariant() {
    await this.page.getByRole('button', { name: 'Add variant' }).click();
    await this.page.waitForURL(/\/variant\/add$/);
  }

  async selectAttributeById(id: string, value: string) {
    const attribute = this.page.locator(`[id="${id}"]`);
    await attribute.waitFor({ state: 'visible', timeout: 10000 });
    await attribute.click();

    // Wait for the dropdown option to appear before clicking
    const option = this.page.locator('li, div[role="option"]').filter({ hasText: value }).first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    await option.click();
  }

  async fillVariantName(name: string) {
    await this.page.locator('[data-test-id="variant-name-input"]').fill(name);
  }

  async saveVariant() {
    await this.page.getByRole('button', { name: 'Save variant' }).click();
  }

  async waitForVariantPage(variantName: string) {
    await this.page.locator('[data-test-id="page-header"]').getByText(variantName).waitFor({ timeout: 10000 });
  }
}
