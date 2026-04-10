/**
 * Supabase Auth mock for Vitest / test environment
 * Replaces lib/supabase-auth.ts in tests.
 *
 * Tests that need a specific user should use the header bypass:
 *   x-test-bypass-token: <TEST_BYPASS_SECRET>
 *   x-test-user-id: <userId>
 *   x-test-user-role: instructor | student
 */

import type { AppUser } from "@/lib/supabase-auth";

export { AppUser };

export async function currentUser(): Promise<AppUser | null> {
  return null;
}

export async function getSupabaseAuthClient() {
  // Tests use getSupabaseServer() (service role) directly
  // This mock is only needed to prevent @supabase/ssr from being imported in test env
  return null as never;
}
