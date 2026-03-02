import { test as base, Page } from "@playwright/test";
import { mockExternalRoutes } from "../helpers/mock-routes";
import crypto from "crypto";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.test") });

const BYPASS_SECRET = process.env.TEST_BYPASS_SECRET ?? "e2e-test-bypass-token-2024";

// --------------- test user objects ---------------

export const TEST_STUDENT = {
  id: "test-student-id",
  firstName: "Test",
  lastName: "Student",
  email: "test-student@test.local",
  unsafeMetadata: { role: "student" as const },
};

export const TEST_INSTRUCTOR = {
  id: "test-instructor-id",
  firstName: "Test",
  lastName: "Instructor",
  email: "test-instructor@test.local",
  unsafeMetadata: { role: "instructor" as const },
};

// --------------- helpers ---------------

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

async function setupAuthPage(
  page: Page,
  user: typeof TEST_STUDENT | typeof TEST_INSTRUCTOR,
) {
  // Mock external routes first
  await mockExternalRoutes(page);

  // Set auth cookies before navigation
  const baseURL = "http://localhost:3000";
  await page.context().addCookies([
    {
      name: "__test_bypass",
      value: BYPASS_SECRET,
      url: baseURL,
    },
    {
      name: "__test_user",
      value: encodeURIComponent(JSON.stringify(user)),
      url: baseURL,
    },
    {
      name: "__test_user_role",
      value: user.unsafeMetadata.role,
      url: baseURL,
    },
  ]);

  // Inject x-test-user-* headers on all API calls
  await page.route("**/api/**", (route) => {
    const headers = route.request().headers();
    return route.continue({
      headers: {
        ...headers,
        "x-test-user-id": user.id,
        "x-test-user-role": user.unsafeMetadata.role,
      },
    });
  });
}

async function setupAdminPage(page: Page) {
  await mockExternalRoutes(page);

  const baseURL = "http://localhost:3000";
  const token = createTestAdminToken();

  await page.context().addCookies([
    {
      name: "__test_bypass",
      value: BYPASS_SECRET,
      url: baseURL,
    },
    {
      name: "admin-session",
      value: token,
      url: baseURL,
    },
  ]);

  // Admin API calls use cookie-based auth, but also add bypass header
  await page.route("**/api/admin/**", (route) => {
    const headers = route.request().headers();
    return route.continue({
      headers: {
        ...headers,
        Cookie: `admin-session=${token}; __test_bypass=${BYPASS_SECRET}`,
      },
    });
  });
}

// --------------- fixtures ---------------

type AuthBrowserFixtures = {
  /** Authenticated student page with cookies + API header injection */
  studentPage: Page;
  /** Authenticated instructor page with cookies + API header injection */
  instructorPage: Page;
  /** Admin page with HMAC session cookie */
  adminPage: Page;
};

export const test = base.extend<AuthBrowserFixtures>({
  studentPage: async ({ page }, use) => {
    await setupAuthPage(page, TEST_STUDENT);
    await use(page);
  },

  instructorPage: async ({ page }, use) => {
    await setupAuthPage(page, TEST_INSTRUCTOR);
    await use(page);
  },

  adminPage: async ({ page }, use) => {
    await setupAdminPage(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
