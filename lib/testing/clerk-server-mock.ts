/**
 * Mock @clerk/nextjs/server for E2E tests.
 *
 * When NODE_ENV=test and Turbopack resolveAlias is active, all
 * `import { clerkMiddleware, ... } from "@clerk/nextjs/server"` resolve here.
 *
 * This provides no-op middleware that skips all Clerk auth checks.
 */

import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";

type MiddlewareHandler = (
  auth: { protect: () => Promise<{ userId: string | null; sessionClaims: unknown }> },
  req: NextRequest,
) => Promise<NextResponse | void> | NextResponse | void;

/**
 * Mock clerkMiddleware: wraps the handler and always calls it
 * without requiring Clerk auth. auth.protect() returns empty data.
 */
export function clerkMiddleware(handler: MiddlewareHandler) {
  return async (req: NextRequest, _event: NextFetchEvent) => {
    const mockAuth = {
      protect: async () => ({
        userId: null as string | null,
        sessionClaims: null as unknown,
      }),
    };

    const result = await handler(mockAuth, req);
    return result ?? NextResponse.next();
  };
}

/**
 * Mock createRouteMatcher: returns a function that matches request
 * paths against the provided patterns (Clerk's simplified glob syntax).
 */
export function createRouteMatcher(patterns: string[]) {
  const regexes = patterns.map((pattern) => {
    // Convert Clerk route pattern to regex:
    // "/admin(.*)" → matches /admin, /admin/foo, /admin/foo/bar
    // "/api(.*)" → matches /api, /api/foo
    let regexStr = pattern
      .replace(/\(/g, "(?:")
      .replace(/\.\*/g, ".*");
    return new RegExp(`^${regexStr}$`);
  });

  return (req: NextRequest) => {
    const pathname = req.nextUrl.pathname;
    return regexes.some((re) => re.test(pathname));
  };
}

/**
 * Re-export server-side Clerk functions that some files import from @clerk/nextjs/server.
 */
export async function currentUser() {
  // In test mode, use lib/get-current-user.ts instead
  return null;
}

export async function auth() {
  return {
    userId: null,
    sessionId: null,
    sessionClaims: null,
  };
}

/**
 * Mock createClerkClient for admin routes.
 */
export function createClerkClient(_opts?: unknown) {
  const mockUser = {
    id: "mock-user-id",
    emailAddresses: [{ emailAddress: "mock@test.local" }],
    firstName: "Mock",
    lastName: "User",
    unsafeMetadata: { role: "student" },
    publicMetadata: {},
    createdAt: new Date(),
    lastSignInAt: null,
    imageUrl: null,
  };

  return {
    users: {
      getUserList: async (_opts?: unknown) => ({ data: [], totalCount: 0 }),
      getUser: async (_userId: string) => mockUser,
      updateUser: async (_userId: string, _data: unknown) => mockUser,
    },
  };
}
