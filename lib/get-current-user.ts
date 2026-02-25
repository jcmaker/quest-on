import { headers } from "next/headers";
import { currentUser as clerkCurrentUser } from "@clerk/nextjs/server";

/**
 * Test-aware wrapper around Clerk's currentUser().
 *
 * In NODE_ENV=test, reads user info from request headers instead of Clerk:
 *   x-test-user-id   → user.id
 *   x-test-user-role  → user.unsafeMetadata.role
 *
 * In production/development, delegates to Clerk normally.
 */
export async function currentUser() {
  if (process.env.NODE_ENV === "test") {
    const hdrs = await headers();
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

    // No test headers → unauthenticated
    return null;
  }

  return clerkCurrentUser();
}
