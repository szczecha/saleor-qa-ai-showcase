import { gql } from 'graphql-request';

export const FIRST_SHIPPABLE_VARIANT = gql`
  query FirstShippableVariant($channel: String!) {
    products(channel: $channel, first: 10) {
      edges {
        node {
          name
          variants {
            id
            name
          }
        }
      }
    }
  }
`;

export const CHECKOUT_CREATE = gql`
  mutation CheckoutCreate($input: CheckoutCreateInput!) {
    checkoutCreate(input: $input) {
      checkout {
        id
      }
      errors {
        field
        code
        message
      }
    }
  }
`;

export const CHECKOUT_LINES_ADD = gql`
  mutation CheckoutLinesAdd($id: ID!, $lines: [CheckoutLineInput!]!) {
    checkoutLinesAdd(id: $id, lines: $lines) {
      checkout {
        id
        isShippingRequired
        lines {
          id
          quantity
          variant {
            id
            name
          }
        }
        availableCollectionPoints {
          id
          name
          clickAndCollectOption
          address {
            streetAddress1
            city
            country {
              code
            }
          }
        }
        availablePaymentGateways {
          id
          name
        }
        totalPrice {
          gross {
            amount
            currency
          }
        }
      }
      errors {
        field
        code
        message
      }
    }
  }
`;

export const CHECKOUT_EMAIL_UPDATE = gql`
  mutation CheckoutEmailUpdate($id: ID!, $email: String!) {
    checkoutEmailUpdate(id: $id, email: $email) {
      checkout {
        id
        email
      }
      errors {
        field
        code
        message
      }
    }
  }
`;

export const CHECKOUT_SHIPPING_ADDRESS_UPDATE = gql`
  mutation CheckoutShippingAddressUpdate(
    $id: ID!
    $shippingAddress: AddressInput!
  ) {
    checkoutShippingAddressUpdate(id: $id, shippingAddress: $shippingAddress) {
      checkout {
        id
        isShippingRequired
        shippingMethods {
          id
          name
          active
          price {
            amount
            currency
          }
        }
        availablePaymentGateways {
          id
          name
        }
      }
      errors {
        field
        code
        message
      }
    }
  }
`;

export const CHECKOUT_BILLING_ADDRESS_UPDATE = gql`
  mutation CheckoutBillingAddressUpdate(
    $id: ID!
    $billingAddress: AddressInput!
  ) {
    checkoutBillingAddressUpdate(id: $id, billingAddress: $billingAddress) {
      checkout {
        id
      }
      errors {
        field
        code
        message
      }
    }
  }
`;

export const CHECKOUT_DELIVERY_METHOD_UPDATE = gql`
  mutation CheckoutDeliveryMethodUpdate($id: ID!, $deliveryMethodId: ID!) {
    checkoutDeliveryMethodUpdate(id: $id, deliveryMethodId: $deliveryMethodId) {
      checkout {
        id
        shippingPrice {
          gross {
            amount
            currency
          }
        }
        totalPrice {
          gross {
            amount
            currency
          }
        }
      }
      errors {
        field
        code
        message
      }
    }
  }
`;

export const TRANSACTION_INITIALIZE = gql`
  mutation TransactionInitialize(
    $checkoutId: ID!
    $paymentGatewayId: String!
    $amount: PositiveDecimal!
  ) {
    transactionInitialize(
      id: $checkoutId
      amount: $amount
      paymentGateway: {
        id: $paymentGatewayId
        data: { event: { type: "CHARGE_SUCCESS", includePspReference: true } }
      }
    ) {
      transaction {
        id
      }
      transactionEvent {
        type
        pspReference
      }
      errors {
        field
        code
        message
      }
    }
  }
`;

export const CHECKOUT_COMPLETE = gql`
  mutation CheckoutComplete($id: ID!) {
    checkoutComplete(id: $id) {
      order {
        id
        status
        total {
          gross {
            amount
            currency
          }
        }
      }
      errors {
        field
        code
        message
      }
    }
  }
`;
