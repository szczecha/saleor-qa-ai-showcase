import { test, expect } from '@playwright/test';
import { gql } from 'graphql-request';
import { gqlClient } from '../../lib/graphql-client';
import type { ProductCountableConnection, ProductWhereInput } from '../../lib/generated/graphql';

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

interface FilteredAttributeNode {
  attribute: { slug: string };
  choice?: { name: string | null; slug: string | null } | null;
  product_ref?: { __typename: string; slug: string } | null;
  page_ref?: { __typename: string; id: string; slug: string } | null;
  products?: Array<{ __typename: string; slug: string }> | null;
}

interface FilteredProductNode {
  id: string;
  name: string;
  category?: { id: string; name: string } | null;
  assignedAttributes?: FilteredAttributeNode[];
}

interface FilteredProductsResponse {
  products: {
    edges: Array<{ node: FilteredProductNode }>;
    totalCount: number | null;
  };
}

const channel = process.env.SALEOR_CHANNEL_USD ?? 'default-channel';

const PRODUCTS_USD_FILTERED = gql`
  query ProductsUsdFiltered($channel: String!, $first: Int!, $where: ProductWhereInput) {
    products(channel: $channel, first: $first, where: $where) {
      edges {
        node {
          id
          name
          category {
            id
            name
          }
          assignedAttributes {
            attribute {
              slug
            }
            ... on AssignedSingleChoiceAttribute {
              choice: value {
                name
                slug
              }
            }
            ... on AssignedSingleProductReferenceAttribute {
              product_ref: value {
                __typename
                slug
              }
            }
            ... on AssignedSinglePageReferenceAttribute {
              page_ref: value {
                __typename
                id
                slug
              }
            }
            ... on AssignedMultiProductReferenceAttribute {
              products: value(limit: 10) {
                __typename
                slug
              }
            }
          }
        }
      }
      totalCount
    }
  }
`;

const TSHIRTS_CATEGORY_SLUG = 't-shirts';
const BRAND_SALEOR_LOOM_SLUG = 'saleor-loom';

let TSHIRTS_CATEGORY_ID: string;
let BRAND_SALEOR_LOOM_REFERENCE_ID: string;

const CATEGORY_BY_SLUG = gql`
  query CategoryBySlug($slugs: [String!]!) {
    categories(filter: { slugs: $slugs }, first: 1) {
      edges {
        node {
          id
        }
      }
    }
  }
`;

const PAGE_BY_SLUG = gql`
  query PageBySlug($slugs: [String!]!) {
    pages(filter: { slugs: $slugs }, first: 1) {
      edges {
        node {
          id
        }
      }
    }
  }
`;

interface CategoryBySlugResponse {
  categories: { edges: Array<{ node: { id: string } }> };
}

interface PageBySlugResponse {
  pages: { edges: Array<{ node: { id: string } }> };
}

test.beforeAll(async () => {
  const [categoryData, pageData] = await Promise.all([
    gqlClient.request<CategoryBySlugResponse>(CATEGORY_BY_SLUG, { slugs: [TSHIRTS_CATEGORY_SLUG] }),
    gqlClient.request<PageBySlugResponse>(PAGE_BY_SLUG, { slugs: [BRAND_SALEOR_LOOM_SLUG] }),
  ]);

  const categoryId = categoryData.categories.edges[0]?.node.id;
  const pageId = pageData.pages.edges[0]?.node.id;

  if (!categoryId) throw new Error(`Category with slug "${TSHIRTS_CATEGORY_SLUG}" not found in sandbox`);
  if (!pageId) throw new Error(`Page with slug "${BRAND_SALEOR_LOOM_SLUG}" not found in sandbox`);

  TSHIRTS_CATEGORY_ID = categoryId;
  BRAND_SALEOR_LOOM_REFERENCE_ID = pageId;
});

const tshirtsBrandMaterialFilter = (): ProductWhereInput => ({
  category: {
    oneOf: [TSHIRTS_CATEGORY_ID],
  },
  attributes: [
    {
      slug: 'brand',
      value: {
        reference: {
          referencedIds: {
            containsAny: [BRAND_SALEOR_LOOM_REFERENCE_ID],
          },
        },
      },
    },
    {
      slug: 'material',
      value: {
        slug: {
          oneOf: ['cotton'],
        },
      },
    },
  ],
});

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

test.describe('Products — filtering by category, brand, and material (USD channel)', () => {
  let products: FilteredProductsResponse['products'];

  test.beforeAll(async () => {
    const data = await gqlClient.request<FilteredProductsResponse>(PRODUCTS_USD_FILTERED, {
      channel,
      first: 12,
      where: tshirtsBrandMaterialFilter(),
    });
    products = data.products;
  });

  test('returns at least one product matching all filters', () => {
    expect(products.edges.length).toBeGreaterThan(0);
  });

  test('every product belongs to the T-Shirts category', () => {
    for (const { node } of products.edges) {
      expect(
        node.category?.id,
        `product "${node.name}" is not in the T-Shirts category`
      ).toBe(TSHIRTS_CATEGORY_ID);
    }
  });

  test('every product has the Saleor-Loom brand reference', () => {
    for (const { node } of products.edges) {
      const brandAttr = node.assignedAttributes?.find(a => a.attribute.slug === 'brand');
      expect(brandAttr, `product "${node.name}" is missing the brand attribute`).toBeDefined();
      expect(
        brandAttr?.page_ref?.id,
        `product "${node.name}" brand does not reference Saleor-Loom (${BRAND_SALEOR_LOOM_REFERENCE_ID})`
      ).toBe(BRAND_SALEOR_LOOM_REFERENCE_ID);
    }
  });

  test('every product has material: cotton', () => {
    for (const { node } of products.edges) {
      const materialAttr = node.assignedAttributes?.find(a => a.attribute.slug === 'material');
      expect(materialAttr, `product "${node.name}" is missing the material attribute`).toBeDefined();
      expect(
        materialAttr?.choice?.slug,
        `product "${node.name}" material is not cotton`
      ).toBe('cotton');
    }
  });
});
