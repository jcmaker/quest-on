import type { BrowserContext, Page } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { TEST_INSTRUCTOR, TEST_STUDENT } from "../fixtures/auth-browser.fixture";
import { mockExternalRoutes } from "./mock-routes";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.test") });

export const BYPASS_SECRET =
  process.env.TEST_BYPASS_SECRET ?? "e2e-test-bypass-token-2024";

export type AuthTestUser = typeof TEST_STUDENT | typeof TEST_INSTRUCTOR;

export async function createAuthPage(
  ctx: BrowserContext,
  user: AuthTestUser,
  baseURL: string
): Promise<Page> {
  const page = await ctx.newPage();
  await mockExternalRoutes(page);

  await ctx.addCookies([
    { name: "__test_bypass", value: BYPASS_SECRET, url: baseURL },
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

  await page.route("**/api/**", (route) => {
    const headers = route.request().headers();
    return route.continue({
      headers: {
        ...headers,
        "x-test-user-id": user.id,
        "x-test-user-role": user.unsafeMetadata.role,
        "x-test-bypass-token": BYPASS_SECRET,
      },
    });
  });

  return page;
}
