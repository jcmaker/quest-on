import { test, expect } from "./fixtures/browser.fixture";

/**
 * Layer 2 — Public Page Smoke Tests
 *
 * Loads each public page in a real browser with external routes mocked.
 * Verifies: no console errors, no network 5xx, page renders content.
 */

const PUBLIC_PAGES = [
  { path: "/", name: "Home" },
  { path: "/join", name: "Join" },
  { path: "/legal/terms", name: "Terms" },
  { path: "/legal/privacy", name: "Privacy" },
  { path: "/legal/security", name: "Security" },
  { path: "/legal/cookies", name: "Cookies" },
  { path: "/admin/login", name: "Admin Login" },
] as const;

test.describe("Public pages smoke tests", () => {
  for (const { path, name } of PUBLIC_PAGES) {
    test(`${name} (${path}) loads without errors`, async ({
      monitoredPage,
    }) => {
      const { page, consoleErrors, networkErrors } = monitoredPage;

      const response = await page.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });

      // Page should return 200
      expect(response?.status()).toBe(200);

      // Wait for initial rendering
      await page.waitForLoadState("networkidle");

      // No console errors
      if (consoleErrors.length > 0) {
        const errorDetails = consoleErrors
          .map((e) => `  [${e.type}] ${e.text}`)
          .join("\n");
        expect(
          consoleErrors,
          `Console errors on ${path}:\n${errorDetails}`,
        ).toHaveLength(0);
      }

      // No network 5xx errors
      if (networkErrors.length > 0) {
        const errorDetails = networkErrors
          .map((e) => `  ${e.method} ${e.url} → ${e.status}`)
          .join("\n");
        expect(
          networkErrors,
          `Network 5xx errors on ${path}:\n${errorDetails}`,
        ).toHaveLength(0);
      }

      // Page should have some content (not blank)
      const bodyText = await page.locator("body").textContent();
      expect(bodyText?.trim().length).toBeGreaterThan(0);
    });
  }
});
