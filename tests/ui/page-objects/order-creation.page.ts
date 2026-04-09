import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Order creation page object.
 * Handles draft order creation flow: channel selection, products, customer, address, shipping, finalization.
 */
export class OrderCreationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigateToOrders(dashboardUrl: string) {
    await this.page.goto(`${dashboardUrl}/orders`);
  }

  async startDraftOrder() {
    const createOrderBtn = this.page.locator('[data-test-id="create-order-button"]');
    await createOrderBtn.click();
  }

  async selectChannel(channelName: string) {
    const channelInput = this.page.locator('input[data-test-id="channel-autocomplete"]');
    await expect(channelInput).toBeVisible();
    await channelInput.click();

    const option = this.page.locator('li').filter({ hasText: channelName });
    await option.click();

    const mutationPromise = this.waitForGraphQLMutation('OrderDraftCreate');

    await this.page.getByRole('button', { name: 'Confirm' }).first().click();
    await mutationPromise;
  }

  async addProducts(productCount: number = 2) {
    await this.page.getByRole('button', { name: 'Add products' }).click();

    // Select first product
    const firstCheckbox = this.page.locator('table tbody tr').first().locator('input[type="checkbox"]');
    await expect(firstCheckbox).toBeVisible();
    await firstCheckbox.check();

    // Select additional products if needed
    for (let i = 1; i < productCount; i++) {
      const checkbox = this.page.locator('table tbody tr').nth(i + 1).locator('input[type="checkbox"]');
      await checkbox.check();
    }

    const mutationPromise = this.waitForGraphQLMutation('OrderLinesAdd');
    await this.page.getByRole('button', { name: 'Confirm' }).first().click();
    await mutationPromise;
  }

  async selectCustomer(customerEmail: string) {
    await this.page.locator('[data-test-id="edit-customer"]').click();

    const customerCombobox = this.page.locator('[data-test-id="select-customer"]');
    await customerCombobox.fill(customerEmail.split('@')[0]); // Fill with part before @

    const option = this.page.getByRole('option', { name: customerEmail });
    await option.click();
  }

  async setShippingAddress() {
    const useCustomerAddressRadio = this.page.getByRole('radio', { name: 'Use one of customer addresses' });
    await expect(useCustomerAddressRadio).toBeVisible();
    if (!await useCustomerAddressRadio.isChecked()) {
      await useCustomerAddressRadio.check();
    }

    const mutationPromise = this.waitForGraphQLMutation('OrderDraftUpdate');
    await this.page.getByRole('button', { name: 'Save' }).click();
    await mutationPromise;
  }

  async setShippingMethod(shippingMethod: string) {
    const setShippingBtn = this.page.getByRole('button', { name: 'Set shipping method' });
    await expect(setShippingBtn).toBeVisible();
    await setShippingBtn.click();

    const shippingCombobox = this.page.locator('[role="combobox"]');
    await expect(shippingCombobox).toBeVisible();
    await shippingCombobox.click();

    await this.page.locator('li').filter({ hasText: new RegExp(shippingMethod) }).first().click();

    const mutationPromise = this.waitForGraphQLMutation('OrderShippingMethodUpdate');
    await this.page.getByRole('button', { name: 'Confirm' }).last().click();
    await mutationPromise;
  }

  async finalizeOrder() {
    const finalizeBtn = this.page.getByRole('button', { name: 'Finalize' });
    await expect(finalizeBtn).toBeVisible();

    const mutationPromise = this.waitForGraphQLMutation('OrderDraftFinalize');
    await finalizeBtn.click();
    await mutationPromise;
  }
}
