import type { Page } from "@playwright/test";

/**
 * Intercept external service requests to prevent real network calls
 * and avoid CSP / CORS issues during browser E2E tests.
 */

const CLERK_PATTERNS = [
  "**/clerk.accounts.dev/**",
  "**/clerk.com/**",
  "**/clerk-telemetry.com/**",
];

const SUPABASE_PATTERNS = ["**/*.supabase.co/**"];

const VERCEL_PATTERNS = [
  "**/va.vercel-scripts.com/**",
  "**/vercel.live/**",
  "**/_vercel/**",
];

const CLOUDFLARE_PATTERNS = ["**/challenges.cloudflare.com/**"];

/**
 * Mock all external service routes on a Playwright page.
 * Returns empty/minimal responses so the page can load without real services.
 */
export async function mockExternalRoutes(page: Page): Promise<void> {
  // Clerk JS SDK & telemetry — return empty JS
  for (const pattern of CLERK_PATTERNS) {
    await page.route(pattern, (route) => {
      const url = route.request().url();
      // Clerk telemetry: just fulfill with empty
      if (url.includes("clerk-telemetry")) {
        return route.fulfill({ status: 200, body: "" });
      }
      // Clerk JS SDK scripts
      if (
        route.request().resourceType() === "script" ||
        url.endsWith(".js")
      ) {
        return route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: "// mocked clerk",
        });
      }
      // Clerk API calls
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });
  }

  // Supabase — return empty JSON
  for (const pattern of SUPABASE_PATTERNS) {
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      }),
    );
  }

  // Vercel Analytics — return empty script
  for (const pattern of VERCEL_PATTERNS) {
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "// mocked vercel",
      }),
    );
  }

  // Cloudflare challenges — return empty
  for (const pattern of CLOUDFLARE_PATTERNS) {
    await page.route(pattern, (route) =>
      route.fulfill({ status: 200, body: "" }),
    );
  }
}
