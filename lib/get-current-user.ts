import { headers } from "next/headers";
import { currentUser as clerkCurrentUser } from "@clerk/nextjs/server";
import { timingSafeEqual } from "crypto";

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Test-aware wrapper around Clerk's currentUser().
 *
 * When TEST_BYPASS_SECRET is set (loaded from .env.test), reads user info
 * from request headers instead of Clerk — but ONLY if the caller also
 * provides a valid `x-test-bypass-token` header matching the secret.
 *
 *   x-test-bypass-token → must equal TEST_BYPASS_SECRET
 *   x-test-user-id      → user.id
 *   x-test-user-role     → user.unsafeMetadata.role
 *
 * In production/development, delegates to Clerk normally.
 */
export async function currentUser() {
  const bypassSecret = process.env.TEST_BYPASS_SECRET;
  if (bypassSecret) {
    const hdrs = await headers();
    const bypassToken = hdrs.get("x-test-bypass-token");

    // Require valid bypass token before trusting test headers
    if (bypassToken && safeEqual(bypassToken, bypassSecret)) {
      const testUserId = hdrs.get("x-test-user-id");
      const testUserRole = hdrs.get("x-test-user-role") || "student";

      if (testUserId) {
        return {
          id: testUserId,
          unsafeMetadata: { role: testUserRole },
          firstName: "Test",
          lastName: "User",
          emailAddresses: [
            { emailAddress: `${testUserId}@test.local` },
          ],
          primaryEmailAddress: {
            emailAddress: `${testUserId}@test.local`,
          },
        } as unknown as Awaited<ReturnType<typeof clerkCurrentUser>>;
      }
    }

    // No valid bypass token or no test user → unauthenticated in test mode
    return null;
  }

  return clerkCurrentUser();
}
