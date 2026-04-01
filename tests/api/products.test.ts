import { test, expect } from '@playwright/test';
import { gql } from 'graphql-request';
import { gqlClient } from '../../lib/graphql-client';
import type { ProductCountableConnection } from '../../lib/generated/graphql';

const PRODUCTS_USD_BROWSE = gql`
  query ProductsUsdBrowse($channel: String!, $first: Int!) {
    products(channel: $channel, first: $first) {
      edges {
        node {
          id
          name
          thumbnail {
            url
            alt
          }
          pricing {
            priceRange {
              start {
                gross {
                  amount
                  currency
                }
              }
              stop {
                gross {
                  amount
                  currency
                }
              }
            }
          }
        }
      }
      totalCount
    }
  }
`;

interface ProductsResponse {
  products: ProductCountableConnection;
}

const channel = process.env.SALEOR_CHANNEL_USD ?? 'default-channel';

test.describe('Products — anonymous browse (USD channel)', () => {
  let products: ProductCountableConnection;

  test.beforeAll(async () => {
    const data = await gqlClient.request<ProductsResponse>(PRODUCTS_USD_BROWSE, {
      channel,
      first: 20,
    });
    products = data.products;
  });

  test('returns at least one product', () => {
    expect(products.totalCount).toBeGreaterThan(0);
    expect(products.edges.length).toBeGreaterThan(0);
  });

  test('every product has a name', () => {
    for (const { node } of products.edges) {
      expect(node.name, `product ${node.id} is missing a name`).toBeTruthy();
    }
  });

  test('every product has a thumbnail URL', () => {
    for (const { node } of products.edges) {
      expect(
        node.thumbnail?.url,
        `product "${node.name}" is missing a thumbnail`
      ).toBeTruthy();
    }
  });

  test('every product has a USD price range', () => {
    for (const { node } of products.edges) {
      const range = node.pricing?.priceRange;
      expect(
        range,
        `product "${node.name}" has no pricing data`
      ).toBeDefined();

      const startAmount = range?.start?.gross?.amount;
      const currency = range?.start?.gross?.currency;

      expect(
        startAmount,
        `product "${node.name}" is missing a start price`
      ).toBeDefined();
      expect(startAmount).toBeGreaterThanOrEqual(0);
      expect(currency).toBe('USD');
    }
  });
});
