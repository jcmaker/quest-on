import { defineConfig } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

const PORT = process.env.E2E_PORT ?? "3000";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Sequential for browser tests; API tests use per-project override
  fullyParallel: false,

  reporter: process.env.CI
    ? [
        ["list"],
        [
          "junit",
          {
            outputFile: path.resolve(
              __dirname,
              "..",
              process.env.PLAYWRIGHT_JUNIT_OUTPUT_NAME ||
                "test-results/results.xml",
            ),
          },
        ],
      ]
    : [["list"], ["html", { open: "never" }]],

  globalSetup: path.resolve(__dirname, "global-setup.ts"),
  globalTeardown: path.resolve(__dirname, "global-teardown.ts"),

  projects: [
    {
      name: "api-integration",
      testDir: "./api",
      fullyParallel: true,
      workers: process.env.CI ? 4 : 2,
      use: {
        baseURL: BASE_URL,
        extraHTTPHeaders: {
          Accept: "application/json",
        },
      },
    },
    {
      name: "browser-e2e",
      testDir: "./browser",
      testIgnore: ["**/flows/**"],
      use: {
        baseURL: BASE_URL,
        browserName: "chromium",
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
      },
    },
    {
      name: "browser-flows",
      testDir: "./browser/flows",
      use: {
        baseURL: BASE_URL,
        browserName: "chromium",
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
      },
    },
  ],

  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      ...process.env,
      NODE_ENV: "test",
      ...loadEnvTest(),
    },
  },
});

function loadEnvTest(): Record<string, string> {
  const envPath = path.resolve(__dirname, "../.env.test");
  const parsed = dotenv.config({ path: envPath });
  return (parsed.parsed as Record<string, string>) ?? {};
}
