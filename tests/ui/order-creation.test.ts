import { test, expect } from '@playwright/test';

test.setTimeout(60000);

test('create order: select products → customer → address → shipping → finalize → unfulfilled status', async ({ page }) => {
  const dashboardUrl = process.env.SALEOR_DASHBOARD_URL;
  if (!dashboardUrl) {
    throw new Error('SALEOR_DASHBOARD_URL environment variable is not set');
  }

  // Step 1: Navigate to orders and create new draft order
  await page.goto(`${dashboardUrl}/orders`);

  // Click Create order button
  const createOrderBtn = page.locator('[data-test-id="create-order-button"]');
  await createOrderBtn.click();

  // Step 2: Select Channel-USD - dialog will appear with channel selector
  const channelInput = page.locator('input[data-test-id="channel-autocomplete"]');
  await expect(channelInput).toBeVisible();
  await channelInput.click();

  // Select Channel-USD from dropdown - wait for option to appear
  const usdOption = page.locator('li').filter({ hasText: 'Channel-USD' });
  await usdOption.click();

  // Confirm channel selection
  let mutationPromise = page.waitForResponse(
    (r) => r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Confirm' }).first().click();
  await mutationPromise;

  // Step 3: Add 2 products
  await page.getByRole('button', { name: 'Add products' }).click();

  // Wait for product dialog to appear and select products
  const firstCheckbox = page.locator('table tbody tr').first().locator('input[type="checkbox"]');
  await expect(firstCheckbox).toBeVisible();
  await firstCheckbox.check();

  // Select second product (Monospace Tee) - third row checkbox
  const secondCheckbox = page.locator('table tbody tr').nth(2).locator('input[type="checkbox"]');
  await secondCheckbox.check();

  // Confirm products
  mutationPromise = page.waitForResponse(
    (r) => r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Confirm' }).first().click();
  await mutationPromise;

  // Step 4: Select customer ashley.cook@example.com
  await page.locator('[data-test-id="edit-customer"]').click();

  const customerCombobox = page.locator('[data-test-id="select-customer"]');
  await customerCombobox.fill('ashley');

  const ashleyOption = page.getByRole('option', { name: 'ashley.cook@example.com' });
  await ashleyOption.click();

  // Step 5: Set shipping address - The address dialog should appear automatically after customer selection
  const useCustomerAddressRadio = page.getByRole('radio', { name: 'Use one of customer addresses' });
  await expect(useCustomerAddressRadio).toBeVisible();
  if (!await useCustomerAddressRadio.isChecked()) {
    await useCustomerAddressRadio.check();
  }

  // Save address selection
  mutationPromise = page.waitForResponse(
    (r) => r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Save' }).click();
  await mutationPromise;

  // Step 6: Set shipping method
  const setShippingBtn = page.getByRole('button', { name: 'Set shipping method' });
  await expect(setShippingBtn).toBeVisible();
  await setShippingBtn.click();

  // Dialog opens - find the combobox input for shipping methods
  const shippingCombobox = page.locator('[role="combobox"]');
  await expect(shippingCombobox).toBeVisible();
  // Click combobox to show list of shipping method choices
  await shippingCombobox.click();

  // Select UPS from the dropdown list
  await page.locator('li').filter({ hasText: /UPS/ }).first().click();

  // Confirm shipping method selection - this triggers the mutation
  mutationPromise = page.waitForResponse(
    (r) => r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Confirm' }).last().click();
  await mutationPromise;

  // Step 7: Finalize the order
  mutationPromise = page.waitForResponse(
    (r) => {
      try {
        const url = r.request().url();
        // Only catch GraphQL responses, not Sentry or other POST requests
        if (!url.includes('graphql')) return false;
        return r.request().method() === 'POST';
      } catch {
        return false;
      }
    }
  );
  const finalizeBtn = page.getByRole('button', { name: 'Finalize' });
  await expect(finalizeBtn).toBeEnabled();
  await finalizeBtn.click();
  await mutationPromise;

  // Step 8: Verify order status is "Unfulfilled"
  // Use first() to match the status chip, not "Unfulfilled order lines"
  await expect(page.locator('[data-test-id="status-info"]')).toBeVisible();
  await expect(page.locator('[data-test-id="status-info"]').getByText('Unfulfilled')).toBeVisible();

  // Verify customer is set
  await expect(page.getByText('ashley.cook@example.com')).toBeVisible();

  // Verify shipping method is UPS
  await expect(page.getByText(/Shipping.*UPS/)).toBeVisible();
});
