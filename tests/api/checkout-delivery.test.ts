import { test, expect } from '@playwright/test';
import { gqlClient } from '../../lib/graphql-client';
import {
  FIRST_SHIPPABLE_VARIANT,
  CHECKOUT_CREATE,
  CHECKOUT_LINES_ADD,
  CHECKOUT_EMAIL_UPDATE,
  CHECKOUT_SHIPPING_ADDRESS_UPDATE,
  CHECKOUT_BILLING_ADDRESS_UPDATE,
  CHECKOUT_DELIVERY_METHOD_UPDATE,
  TRANSACTION_INITIALIZE,
  CHECKOUT_COMPLETE,
} from '../../lib/checkout-operations';
import type {
  CheckoutCreate,
  CheckoutLinesAdd,
  CheckoutEmailUpdate,
  CheckoutShippingAddressUpdate,
  CheckoutBillingAddressUpdate,
  CheckoutDeliveryMethodUpdate,
  CheckoutComplete,
  TransactionInitialize,
  Checkout,
} from '../../lib/generated/graphql';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FirstShippableVariantResponse {
  products: {
    edges: Array<{
      node: {
        name: string;
        variants: Array<{ id: string; name: string }> | null;
      };
    }>;
  };
}

interface CheckoutCreateResponse { checkoutCreate: CheckoutCreate }
interface CheckoutLinesAddResponse { checkoutLinesAdd: CheckoutLinesAdd }
interface CheckoutEmailUpdateResponse { checkoutEmailUpdate: CheckoutEmailUpdate }
interface CheckoutShippingAddressUpdateResponse { checkoutShippingAddressUpdate: CheckoutShippingAddressUpdate }
interface CheckoutBillingAddressUpdateResponse { checkoutBillingAddressUpdate: CheckoutBillingAddressUpdate }
interface CheckoutDeliveryMethodUpdateResponse { checkoutDeliveryMethodUpdate: CheckoutDeliveryMethodUpdate }
interface TransactionInitializeResponse { transactionInitialize: TransactionInitialize }
interface CheckoutCompleteResponse { checkoutComplete: CheckoutComplete }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const channel = process.env.SALEOR_CHANNEL_USD ?? 'default-channel';

const ADDRESS = {
  firstName: 'Test',
  lastName: 'API-Buyer',
  streetAddress1: '123 Main St',
  city: 'New York',
  postalCode: '10001',
  country: 'US',
  countryArea: 'NY',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe.serial('Checkout — anonymous buyer, courier delivery (USD)', () => {
  let variantId: string;
  let checkoutId: string;
  let gatewayId: string;
  let shippingMethodId: string;
  let totalAfterShipping: number;

  test.beforeAll(async () => {
    const data = await gqlClient.request<FirstShippableVariantResponse>(
      FIRST_SHIPPABLE_VARIANT,
      { channel }
    );
    const productWithVariants = data.products.edges.find(
      ({ node }) => node.variants && node.variants.length > 0
    );
    if (!productWithVariants?.node.variants?.[0]) {
      throw new Error('No product with variants found in USD channel');
    }
    variantId = productWithVariants.node.variants[0].id;
  });

  // 1. Buyer opens the store — empty cart
  test('step 1 — checkoutCreate starts an empty cart', async () => {
    const data = await gqlClient.request<CheckoutCreateResponse>(
      CHECKOUT_CREATE,
      { input: { channel, lines: [] } }
    );

    expect(
      data.checkoutCreate.errors,
      `checkoutCreate errors: ${JSON.stringify(data.checkoutCreate.errors)}`
    ).toHaveLength(0);

    checkoutId = (data.checkoutCreate.checkout as Checkout).id;
    expect(checkoutId).toBeTruthy();
  });

  // 2. Buyer browses and adds a product to the cart
  test('step 2 — checkoutLinesAdd puts the product in the cart', async () => {
    const data = await gqlClient.request<CheckoutLinesAddResponse>(
      CHECKOUT_LINES_ADD,
      { id: checkoutId, lines: [{ variantId, quantity: 1 }] }
    );

    expect(
      data.checkoutLinesAdd.errors,
      `checkoutLinesAdd errors: ${JSON.stringify(data.checkoutLinesAdd.errors)}`
    ).toHaveLength(0);

    const checkout = data.checkoutLinesAdd.checkout as Checkout;
    expect(checkout.lines).toHaveLength(1);
    expect(checkout.lines[0].variant.id).toBe(variantId);
    expect(checkout.lines[0].quantity).toBe(1);
  });

  // 3. Buyer proceeds to checkout and enters their email
  test('step 3 — checkoutEmailUpdate sets buyer email', async () => {
    const data = await gqlClient.request<CheckoutEmailUpdateResponse>(
      CHECKOUT_EMAIL_UPDATE,
      { id: checkoutId, email: 'test-anonymous-buyer@example.com' }
    );

    expect(
      data.checkoutEmailUpdate.errors,
      `checkoutEmailUpdate errors: ${JSON.stringify(data.checkoutEmailUpdate.errors)}`
    ).toHaveLength(0);

    expect(data.checkoutEmailUpdate.checkout?.email).toBe(
      'test-anonymous-buyer@example.com'
    );
  });

  // 4. Buyer enters shipping address — this unlocks available shipping methods
  test('step 4 — checkoutShippingAddressUpdate unlocks shipping methods', async () => {
    const data =
      await gqlClient.request<CheckoutShippingAddressUpdateResponse>(
        CHECKOUT_SHIPPING_ADDRESS_UPDATE,
        { id: checkoutId, shippingAddress: ADDRESS }
      );

    expect(
      data.checkoutShippingAddressUpdate.errors,
      `checkoutShippingAddressUpdate errors: ${JSON.stringify(data.checkoutShippingAddressUpdate.errors)}`
    ).toHaveLength(0);

    const checkout = data.checkoutShippingAddressUpdate.checkout as Checkout;
    expect(checkout.isShippingRequired).toBe(true);

    expect(
      checkout.availablePaymentGateways.length,
      'No payment gateways available'
    ).toBeGreaterThan(0);
    gatewayId = checkout.availablePaymentGateways[0].id;

    const paidMethod = checkout.shippingMethods.find(
      (m) => m.active && m.price.amount > 0
    );
    expect(
      paidMethod,
      `No active paid shipping method found. Methods: ${JSON.stringify(checkout.shippingMethods)}`
    ).toBeDefined();
    shippingMethodId = paidMethod!.id;
  });

  // 5. Buyer enters billing address
  test('step 5 — checkoutBillingAddressUpdate sets billing address', async () => {
    const data =
      await gqlClient.request<CheckoutBillingAddressUpdateResponse>(
        CHECKOUT_BILLING_ADDRESS_UPDATE,
        { id: checkoutId, billingAddress: ADDRESS }
      );

    expect(
      data.checkoutBillingAddressUpdate.errors,
      `checkoutBillingAddressUpdate errors: ${JSON.stringify(data.checkoutBillingAddressUpdate.errors)}`
    ).toHaveLength(0);
  });

  // 6. Buyer selects a paid shipping method
  test('step 6 — checkoutDeliveryMethodUpdate selects paid shipping', async () => {
    const data =
      await gqlClient.request<CheckoutDeliveryMethodUpdateResponse>(
        CHECKOUT_DELIVERY_METHOD_UPDATE,
        { id: checkoutId, deliveryMethodId: shippingMethodId }
      );

    expect(
      data.checkoutDeliveryMethodUpdate.errors,
      `checkoutDeliveryMethodUpdate errors: ${JSON.stringify(data.checkoutDeliveryMethodUpdate.errors)}`
    ).toHaveLength(0);

    const checkout = data.checkoutDeliveryMethodUpdate.checkout as Checkout;
    expect(checkout.shippingPrice.gross.amount).toBeGreaterThan(0);
    expect(checkout.shippingPrice.gross.currency).toBe('USD');

    totalAfterShipping = checkout.totalPrice.gross.amount;
    expect(totalAfterShipping).toBeGreaterThan(0);
  });

  // 7. Buyer pays via the dummy payment gateway
  test('step 7 — transactionInitialize charges via dummy gateway', async () => {
    const data = await gqlClient.request<TransactionInitializeResponse>(
      TRANSACTION_INITIALIZE,
      {
        checkoutId,
        paymentGatewayId: gatewayId,
        amount: totalAfterShipping,
      }
    );

    expect(
      data.transactionInitialize.errors,
      `transactionInitialize errors: ${JSON.stringify(data.transactionInitialize.errors)}`
    ).toHaveLength(0);

    expect(data.transactionInitialize.transaction?.id).toBeTruthy();
    expect(data.transactionInitialize.transactionEvent?.type).toBe(
      'CHARGE_SUCCESS'
    );
    expect(
      data.transactionInitialize.transactionEvent?.pspReference
    ).toBeTruthy();
  });

  // 8. Checkout completes and an order is created
  test('step 8 — checkoutComplete creates an order', async () => {
    const data = await gqlClient.request<CheckoutCompleteResponse>(
      CHECKOUT_COMPLETE,
      { id: checkoutId }
    );

    expect(
      data.checkoutComplete.errors,
      `checkoutComplete errors: ${JSON.stringify(data.checkoutComplete.errors)}`
    ).toHaveLength(0);

    const order = data.checkoutComplete.order;
    expect(order?.id).toBeTruthy();
    expect(order?.status).toBe('UNFULFILLED');
    expect(order?.total?.gross.amount).toBeGreaterThan(0);
    expect(order?.total?.gross.currency).toBe('USD');
  });
});
