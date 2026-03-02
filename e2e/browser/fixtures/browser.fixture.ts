import { test as base, Page } from "@playwright/test";
import { mockExternalRoutes } from "../helpers/mock-routes";

export type ConsoleEntry = {
  type: string;
  text: string;
  url?: string;
};

export type NetworkError = {
  url: string;
  status: number;
  method: string;
};

export type MonitoredPage = {
  page: Page;
  consoleErrors: ConsoleEntry[];
  consoleWarnings: ConsoleEntry[];
  networkErrors: NetworkError[];
};

type BrowserFixtures = {
  /** Page with console & network monitoring + external routes mocked */
  monitoredPage: MonitoredPage;
};

export const test = base.extend<BrowserFixtures>({
  monitoredPage: async ({ page }, use) => {
    const consoleErrors: ConsoleEntry[] = [];
    const consoleWarnings: ConsoleEntry[] = [];
    const networkErrors: NetworkError[] = [];

    // Mock external routes before any navigation
    await mockExternalRoutes(page);

    // Collect console errors and warnings
    page.on("console", (msg) => {
      const entry: ConsoleEntry = {
        type: msg.type(),
        text: msg.text(),
        url: page.url(),
      };

      if (msg.type() === "error") {
        // Ignore known benign errors
        if (isKnownBenignError(msg.text())) return;
        consoleErrors.push(entry);
      }
      if (msg.type() === "warning") {
        consoleWarnings.push(entry);
      }
    });

    // Collect page errors (unhandled exceptions)
    page.on("pageerror", (error) => {
      consoleErrors.push({
        type: "pageerror",
        text: error.message,
        url: page.url(),
      });
    });

    // Monitor network responses for 4xx/5xx
    page.on("response", (response) => {
      const status = response.status();
      if (status >= 500) {
        networkErrors.push({
          url: response.url(),
          status,
          method: response.request().method(),
        });
      }
    });

    await use({ page, consoleErrors, consoleWarnings, networkErrors });
  },
});

export { expect } from "@playwright/test";

/**
 * Filter out known benign console errors that don't indicate real problems.
 */
function isKnownBenignError(text: string): boolean {
  const benignPatterns = [
    // Next.js dev mode hydration warnings
    "Hydration failed",
    "There was an error while hydrating",
    "Text content does not match",
    // Clerk initialization in test mode
    "Clerk:",
    "clerk",
    "publishableKey",
    // React dev-mode warnings
    "React does not recognize",
    "Warning:",
    // Service worker registration (not critical)
    "service worker",
    // favicon.ico 404 is benign
    "favicon.ico",
  ];

  return benignPatterns.some(
    (p) => text.includes(p) || text.toLowerCase().includes(p.toLowerCase()),
  );
}
