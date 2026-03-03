import { test as base, APIRequestContext } from "@playwright/test";
import crypto from "crypto";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

const BYPASS_SECRET = process.env.TEST_BYPASS_SECRET ?? "e2e-test-bypass-token-2024";

// --------------- Admin token generation ---------------

function createTestAdminToken(): string {
  const secret = process.env.ADMIN_SESSION_SECRET!;
  const payload = JSON.stringify({
    sid: crypto.randomBytes(16).toString("hex"),
    iat: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000,
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${signature}`;
}

// --------------- Custom fixtures ---------------

type AuthFixtures = {
  /** APIRequestContext with instructor auth headers */
  instructorRequest: APIRequestContext;
  /** APIRequestContext with student auth headers */
  studentRequest: APIRequestContext;
  /** APIRequestContext with admin session cookie */
  adminRequest: APIRequestContext;
  /** APIRequestContext with no auth (anonymous) */
  anonRequest: APIRequestContext;
};

export const test = base.extend<AuthFixtures>({
  instructorRequest: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-instructor-id",
        "x-test-user-role": "instructor",
        "x-test-bypass-token": BYPASS_SECRET,
        Accept: "application/json",
      },
    });
    await use(ctx);
    await ctx.dispose();
  },

  studentRequest: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-student-id",
        "x-test-user-role": "student",
        "x-test-bypass-token": BYPASS_SECRET,
        Accept: "application/json",
      },
    });
    await use(ctx);
    await ctx.dispose();
  },

  adminRequest: async ({ playwright }, use) => {
    const token = createTestAdminToken();
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        Accept: "application/json",
        Cookie: `admin-session=${token}`,
      },
    });
    await use(ctx);
    await ctx.dispose();
  },

  anonRequest: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        Accept: "application/json",
      },
    });
    await use(ctx);
    await ctx.dispose();
  },
});

export { expect } from "@playwright/test";
