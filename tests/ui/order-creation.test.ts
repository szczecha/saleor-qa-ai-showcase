import { test } from '@playwright/test';
import { OrderCreationPage } from './page-objects/order-creation.page';

test.setTimeout(60000);

test('create order: select products → customer → address → shipping → finalize → unfulfilled status', async ({ page }) => {
  const dashboardUrl = process.env.SALEOR_DASHBOARD_URL;
  if (!dashboardUrl) {
    throw new Error('SALEOR_DASHBOARD_URL environment variable is not set');
  }

  const orderPage = new OrderCreationPage(page);

  // Step 1: Navigate to orders and create new draft order
  await orderPage.navigateToOrders(dashboardUrl);
  await orderPage.startDraftOrder();

  // Step 2: Select Channel-USD
  await orderPage.selectChannel('Channel-USD');

  // Step 3: Add 2 products
  await orderPage.addProducts(2);

  // Step 4: Select customer ashley.cook@example.com
  await orderPage.selectCustomer('ashley.cook@example.com');

  // Step 5: Set shipping address
  await orderPage.setShippingAddress();

  // Step 6: Set shipping method
  await orderPage.setShippingMethod('UPS');

  // Step 7: Finalize the order
  await orderPage.finalizeOrder();

  // Step 8: Verify order status and details
  await orderPage.assertOrderStatus('Unfulfilled');
  await orderPage.assertCustomerSet('ashley.cook@example.com');
  await orderPage.assertShippingMethod('UPS');
});
