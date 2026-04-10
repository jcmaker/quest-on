/**
 * Supabase Auth mock for Vitest / test environment
 * Replaces lib/supabase-auth.ts in tests.
 *
 * Tests that need a specific user should use the header bypass:
 *   x-test-bypass-token: <TEST_BYPASS_SECRET>
 *   x-test-user-id: <userId>
 *   x-test-user-role: instructor | student
 */

import { timingSafeEqual } from "crypto";

export type AppUser = {
  id: string;
  email: string;
  role: "instructor" | "student";
  status: "pending" | "approved";
  fullName: string | null;
  avatarUrl: string | null;
};

export async function currentUser(): Promise<AppUser | null> {
  const bypassSecret = process.env.TEST_BYPASS_SECRET;
  if (!bypassSecret) return null;

  const { headers } = await import("next/headers");
  const hdrs = await headers();
  const token = hdrs.get("x-test-bypass-token");

  if (
    token &&
    token.length === bypassSecret.length &&
    timingSafeEqual(Buffer.from(token), Buffer.from(bypassSecret))
  ) {
    const testId = hdrs.get("x-test-user-id");
    const testRole = (hdrs.get("x-test-user-role") ?? "student") as AppUser["role"];
    if (testId) {
      return {
        id: testId,
        email: `${testId}@test.local`,
        role: testRole,
        status: "approved",
        fullName: "Test User",
        avatarUrl: null,
      };
    }
  }
  return null;
}

export async function getSupabaseAuthClient() {
  // Tests use getSupabaseServer() (service role) directly
  // This mock is only needed to prevent @supabase/ssr from being imported in test env
  return null as never;
}
