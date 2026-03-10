import { test, expect } from "./fixtures/browser.fixture";
import { TIMEOUTS } from "../constants";

/**
 * Layer 2 — Auth Page Shell Smoke Tests
 *
 * These pages require authentication (Clerk / admin session).
 * With external routes mocked, they'll likely redirect or show auth UI.
 * We verify they don't produce 5xx errors or unhandled exceptions.
 */

const AUTH_PAGES = [
  { path: "/student", name: "Student Dashboard" },
  { path: "/instructor", name: "Instructor Dashboard" },
  { path: "/admin", name: "Admin Dashboard" },
] as const;

test.describe("Auth page shell smoke tests", () => {
  for (const { path, name } of AUTH_PAGES) {
    test(`${name} (${path}) loads without 5xx or unhandled errors`, async ({
      monitoredPage,
    }) => {
      const { page, consoleErrors, networkErrors } = monitoredPage;

      const response = await page.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUTS.PAGE_LOAD,
      });

      // Auth pages may redirect (302→sign-in) or return 200
      // Either is acceptable — but NOT 5xx
      const status = response?.status() ?? 0;
      expect(status, `${path} returned ${status}`).toBeLessThan(500);
      expect(status, `${path} returned 404 — route may be broken`).not.toBe(404);

      // Wait for initial rendering / redirect to settle
      await page.waitForLoadState("domcontentloaded");

      // No network 5xx errors (on any sub-request)
      const networkErrorDetails = networkErrors
        .map((e) => `  ${e.method} ${e.url} → ${e.status}`)
        .join("\n");
      expect(
        networkErrors,
        `Network 5xx errors on ${path}:\n${networkErrorDetails}`,
      ).toHaveLength(0);

      // No unhandled page errors (pageerror type)
      const unhandledErrors = consoleErrors.filter(
        (e) => e.type === "pageerror",
      );
      const unhandledErrorDetails = unhandledErrors
        .map((e) => `  ${e.text}`)
        .join("\n");
      expect(
        unhandledErrors,
        `Unhandled errors on ${path}:\n${unhandledErrorDetails}`,
      ).toHaveLength(0);
    });
  }
});
