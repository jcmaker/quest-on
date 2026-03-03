import { defineConfig } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Sequential for DB consistency

  reporter: [["list"], ["html", { open: "never" }]],

  globalSetup: path.resolve(__dirname, "global-setup.ts"),
  globalTeardown: path.resolve(__dirname, "global-teardown.ts"),

  projects: [
    {
      name: "api-integration",
      testDir: "./api",
      use: {
        baseURL: "http://localhost:3000",
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
        baseURL: "http://localhost:3000",
        browserName: "chromium",
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
      },
    },
    {
      name: "browser-flows",
      testDir: "./browser/flows",
      use: {
        baseURL: "http://localhost:3000",
        browserName: "chromium",
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
      },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
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
