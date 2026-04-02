import { GraphQLClient } from 'graphql-request';

if (!process.env.SALEOR_API_URL) {
  throw new Error('SALEOR_API_URL is not set');
}

/**
 * Unauthenticated client — for public queries and customer-facing operations.
 */
export const gqlClient = new GraphQLClient(process.env.SALEOR_API_URL);

/**
 * Returns an authenticated client using a staff bearer token.
 */
export function authenticatedClient(token: string): GraphQLClient {
  return new GraphQLClient(process.env.SALEOR_API_URL!, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
