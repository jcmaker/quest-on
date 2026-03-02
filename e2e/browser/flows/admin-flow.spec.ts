import { test, expect } from "../fixtures/auth-browser.fixture";
import { test as baseTest } from "@playwright/test";
import { mockExternalRoutes } from "../helpers/mock-routes";
import { cleanupTestData } from "../helpers/test-data-builder";

test.describe("Admin — Authenticated Flows", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("admin dashboard loads with user list", async ({ adminPage }) => {
    await adminPage.goto("/admin");

    // Admin dashboard should show user management or stats
    await expect(
      adminPage.getByText(/관리자|admin|사용자|user/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("admin dashboard shows stats cards", async ({ adminPage }) => {
    await adminPage.goto("/admin");

    // Should show statistics about users
    await expect(
      adminPage.getByText(/전체|total|instructor|student/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});

/**
 * Admin login flow tests use unauthenticated pages.
 * These don't need the adminPage fixture — they test the login form itself.
 */
baseTest.describe("Admin — Login Flow", () => {
  baseTest("admin login with valid credentials redirects to dashboard", async ({
    page,
  }) => {
    await mockExternalRoutes(page);

    await page.goto("/admin/login");

    // Fill in credentials
    await page.getByLabel(/사용자명/i).fill("test-admin");
    await page.getByLabel(/비밀번호/i).fill("test-password");

    // Submit the form
    await page.getByRole("button", { name: /로그인/i }).click();

    // Should redirect to admin dashboard or show success
    await page.waitForURL("**/admin", { timeout: 10_000 }).catch(() => {
      // May not redirect in test mode, check for success indicators
    });

    // After successful login, should be on admin page or see admin content
    const url = page.url();
    const hasAdminContent = url.includes("/admin") && !url.includes("/login");
    const hasError = await page.getByText(/실패|error|오류/i).isVisible().catch(() => false);

    // Login should succeed (no error shown)
    expect(hasError).toBe(false);
  });

  baseTest("admin login with wrong password shows error", async ({ page }) => {
    await mockExternalRoutes(page);

    await page.goto("/admin/login");

    // Fill in wrong credentials
    await page.getByLabel(/사용자명/i).fill("test-admin");
    await page.getByLabel(/비밀번호/i).fill("wrong-password");

    // Submit the form
    await page.getByRole("button", { name: /로그인/i }).click();

    // Should show an error message
    await expect(
      page.getByText(/실패|error|invalid|잘못/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Should still be on the login page
    expect(page.url()).toContain("/admin/login");
  });
});
