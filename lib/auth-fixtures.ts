import { gqlClient } from './graphql-client';
import { gql } from 'graphql-request';

const TOKEN_CREATE = gql`
  mutation TokenCreate($email: String!, $password: String!) {
    tokenCreate(email: $email, password: $password) {
      token
      errors {
        field
        message
      }
    }
  }
`;

interface TokenCreateResponse {
  tokenCreate: {
    token: string | null;
    errors: Array<{ field: string | null; message: string }>;
  };
}

let cachedToken: string | null = null;

/**
 * Returns a staff auth token, creating one per suite run and caching it.
 * Call this in beforeAll — not in beforeEach.
 */
export async function getStaffToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const email = process.env.SALEOR_STAFF_EMAIL;
  const password = process.env.SALEOR_STAFF_PASSWORD;

  if (!email || !password) {
    throw new Error('SALEOR_STAFF_EMAIL or SALEOR_STAFF_PASSWORD is not set');
  }

  const data = await gqlClient.request<TokenCreateResponse>(TOKEN_CREATE, {
    email,
    password,
  });

  if (data.tokenCreate.errors.length > 0) {
    throw new Error(
      `Staff token creation failed: ${JSON.stringify(data.tokenCreate.errors)}`
    );
  }

  if (!data.tokenCreate.token) {
    throw new Error('tokenCreate returned null token with no errors');
  }

  cachedToken = data.tokenCreate.token;
  return cachedToken;
}
