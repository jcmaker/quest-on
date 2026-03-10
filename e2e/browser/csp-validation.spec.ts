import { test, expect } from "@playwright/test";
import { parseCSP, assertDirectiveContains } from "./helpers/csp-parser";

/**
 * Layer 1 — CSP & Security Header Validation
 *
 * HTTP-only tests (no browser needed). Fetches a page and validates
 * the Content-Security-Policy and other security headers.
 */

test.describe("CSP directive validation", () => {
  let cspHeader: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/");
    cspHeader = response.headers()["content-security-policy"] ?? "";
    expect(cspHeader).toBeTruthy();
  });

  test("frame-src includes youtube.com", async () => {
    const directives = parseCSP(cspHeader);
    const result = assertDirectiveContains(
      directives,
      "frame-src",
      "https://www.youtube.com",
    );
    expect(result.pass, result.message).toBe(true);
  });

  test("connect-src includes clerk-telemetry.com", async () => {
    const directives = parseCSP(cspHeader);
    const result = assertDirectiveContains(
      directives,
      "connect-src",
      "https://clerk-telemetry.com",
    );
    expect(result.pass, result.message).toBe(true);
  });

  test("script-src includes clerk accounts dev", async () => {
    const directives = parseCSP(cspHeader);
    const result = assertDirectiveContains(
      directives,
      "script-src",
      "https://*.clerk.accounts.dev",
    );
    expect(result.pass, result.message).toBe(true);
  });

  test("script-src includes vercel scripts", async () => {
    const directives = parseCSP(cspHeader);
    const result = assertDirectiveContains(
      directives,
      "script-src",
      "https://va.vercel-scripts.com",
    );
    expect(result.pass, result.message).toBe(true);
  });

  test("img-src includes clerk image domain", async () => {
    const directives = parseCSP(cspHeader);
    const result = assertDirectiveContains(
      directives,
      "img-src",
      "https://img.clerk.com",
    );
    expect(result.pass, result.message).toBe(true);
  });

  test("connect-src includes supabase", async () => {
    const directives = parseCSP(cspHeader);
    const result = assertDirectiveContains(
      directives,
      "connect-src",
      "https://*.supabase.co",
    );
    expect(result.pass, result.message).toBe(true);
  });
});

test.describe("Security headers", () => {
  let headers: Record<string, string>;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/");
    headers = {};
    for (const [key, value] of Object.entries(response.headers())) {
      headers[key.toLowerCase()] = value as string;
    }
  });

  test("Strict-Transport-Security header is present", async () => {
    expect(headers["strict-transport-security"]).toBeTruthy();
    expect(headers["strict-transport-security"]).toContain("max-age=");
  });

  test("X-Content-Type-Options is nosniff", async () => {
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("X-Frame-Options is DENY", async () => {
    expect(headers["x-frame-options"]).toBe("DENY");
  });

  test("Referrer-Policy is set", async () => {
    expect(headers["referrer-policy"]).toBeTruthy();
    expect(headers["referrer-policy"]).toContain("origin");
  });
});
