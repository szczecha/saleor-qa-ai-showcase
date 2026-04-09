import { Page, expect } from '@playwright/test';

/**
 * Base page object with shared utilities for all Dashboard pages.
 * Handles common patterns: error checking, GraphQL mutation waiting, combobox selection.
 */
export class BasePage {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Wait for a GraphQL mutation response filtered by operationName.
   * Use before clicking a submit button to ensure the mutation completes before asserting.
   */
  protected waitForGraphQLMutation(operationName: string) {
    return this.page.waitForResponse(
      (r) => {
        try {
          const url = r.request().url();
          if (!url.includes('graphql')) return false;
          const postData = r.request().postDataJSON();
          return postData?.operationName === operationName;
        } catch {
          return false;
        }
      }
    );
  }

  /**
   * Assert that no error toast is visible.
   * Call after mutations to verify the server accepted the change.
   */
  async assertNoErrorToast() {
    await expect(
      this.page.locator('[data-testid="error-toast"]')
    ).not.toBeVisible();
  }

  /**
   * Select an option from a labeled combobox (accessible via getByRole).
   * Handles both role-based and custom dropdowns.
   *
   * @param label - The combobox label (e.g., "Product type", "Category")
   * @param optionText - The text of the option to select
   */
  async selectFromCombobox(label: string, optionText: string) {
    const combobox = this.page.getByRole('combobox', { name: label });
    await combobox.click();

    const option = this.page
      .locator('li, div[role="option"]')
      .filter({ hasText: optionText })
      .first();
    await option.click({ timeout: 10000 });
  }

  /**
   * Select an option from a combobox identified by ID (e.g., attribute dropdowns).
   * Used for form fields with data-* IDs that aren't accessible via role.
   *
   * @param id - The ID of the combobox (e.g., "attribute:Material")
   * @param optionText - The text of the option to select
   */
  async selectFromComboboxById(id: string, optionText: string) {
    const combobox = this.page.locator(`[id="${id}"]`);
    await combobox.click();

    const option = this.page
      .locator('li, div[role="option"]')
      .filter({ hasText: optionText })
      .first();
    await option.click({ timeout: 10000 });
  }

  /**
   * Navigate to a Dashboard page by relative path.
   *
   * @param path - Relative path (e.g., "/products", "/orders")
   */
  async goto(path: string) {
    await this.page.goto(`/dashboard${path}`);
  }
}
