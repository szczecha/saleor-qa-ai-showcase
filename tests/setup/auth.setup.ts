import { test, expect } from '@playwright/test';
import { gqlClient } from '../../lib/graphql-client';
import { gql } from 'graphql-request';

const TOKEN_CREATE = gql`
  mutation TokenCreate($email: String!, $password: String!) {
    tokenCreate(email: $email, password: $password) {
      token
      refreshToken
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
    refreshToken: string | null;
    errors: Array<{ field: string | null; message: string }>;
  };
}

test('authenticate and save storage state', async ({ browser }) => {
  // Get staff credentials from environment
  const email = process.env.SALEOR_STAFF_EMAIL;
  const password = process.env.SALEOR_STAFF_PASSWORD;

  if (!email || !password) {
    throw new Error('SALEOR_STAFF_EMAIL or SALEOR_STAFF_PASSWORD is not set');
  }

  // Create staff token via API (no browser needed)
  const data = await gqlClient.request<TokenCreateResponse>(TOKEN_CREATE, {
    email,
    password,
  });

  if (data.tokenCreate.errors.length > 0) {
    throw new Error(
      `Staff token creation failed: ${JSON.stringify(data.tokenCreate.errors)}`
    );
  }

  const refreshToken = data.tokenCreate.refreshToken;
  if (!refreshToken) {
    throw new Error('tokenCreate returned null refreshToken with no errors');
  }

  expect(refreshToken).toBeTruthy();

  // Create a browser context and page
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to dashboard to establish domain context
    const dashboardUrl = process.env.SALEOR_DASHBOARD_URL;
    if (!dashboardUrl) {
      throw new Error('SALEOR_DASHBOARD_URL is not set');
    }

    await page.goto(dashboardUrl);

    // Inject the refreshToken into localStorage with the correct key
    // The Saleor Dashboard stores the refreshToken under '_saleorRefreshToken'
    await page.evaluate((token) => {
      localStorage.setItem('_saleorRefreshToken', token);
      // Also set lastLoginMethod to match the login flow
      localStorage.setItem('lastLoginMethod', 'password');
    }, refreshToken);

    // Wait for the dashboard to load and process the token
    await page.waitForLoadState('networkidle');

    // Verify we're authenticated by checking if we're still on the dashboard
    expect(page.url()).toContain('/dashboard');

    // Save the authenticated browser state
    await context.storageState({ path: 'tests/.auth/staff.json' });

    console.log('✓ Authentication setup complete. State saved to tests/.auth/staff.json');
  } finally {
    await context.close();
  }
});
