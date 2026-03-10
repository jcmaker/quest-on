"use client";

/**
 * Mock @clerk/nextjs module for E2E browser tests.
 *
 * When NODE_ENV=test and Turbopack resolveAlias is active, all
 * `import { useUser, ... } from "@clerk/nextjs"` resolve here.
 *
 * User state is driven by the `__test_user` cookie (JSON-encoded).
 * If the cookie is absent the mock behaves as "signed out".
 */

import React from "react";

// --------------- cookie helpers ---------------

function getTestUserCookie(): Record<string, unknown> | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith("__test_user="));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match.split("=").slice(1).join("=")));
  } catch {
    return null;
  }
}

// --------------- useUser ---------------

export function useUser() {
  const cookie = getTestUserCookie();
  if (!cookie) {
    return { user: null, isLoaded: true, isSignedIn: false };
  }
  return {
    user: {
      id: cookie.id as string,
      firstName: (cookie.firstName as string) ?? "Test",
      lastName: (cookie.lastName as string) ?? "User",
      fullName: `${(cookie.firstName as string) ?? "Test"} ${(cookie.lastName as string) ?? "User"}`,
      primaryEmailAddress: {
        emailAddress:
          (cookie.email as string) ?? `${cookie.id}@test.local`,
      },
      emailAddresses: [
        {
          emailAddress:
            (cookie.email as string) ?? `${cookie.id}@test.local`,
        },
      ],
      imageUrl: "",
      unsafeMetadata: cookie.unsafeMetadata ?? { role: "student" },
    },
    isLoaded: true,
    isSignedIn: true,
  };
}

// --------------- useAuth ---------------

export function useAuth() {
  const cookie = getTestUserCookie();
  return {
    isLoaded: true,
    isSignedIn: !!cookie,
    userId: cookie?.id ?? null,
    sessionId: "test-session",
    getToken: async () => "test-token",
  };
}

// --------------- useClerk ---------------

export function useClerk() {
  return {
    signOut: async () => {
      document.cookie =
        "__test_user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      document.cookie =
        "__test_bypass=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      document.cookie =
        "__test_user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      window.location.href = "/";
    },
    user: getTestUserCookie(),
    session: { id: "test-session" },
    loaded: true,
  };
}

// --------------- ClerkProvider ---------------

export function ClerkProvider({
  children,
}: {
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  return React.createElement(React.Fragment, null, children);
}

// --------------- SignedIn / SignedOut ---------------

export function SignedIn({ children }: { children: React.ReactNode }) {
  const cookie = getTestUserCookie();
  if (!cookie) return null;
  return React.createElement(React.Fragment, null, children);
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  const cookie = getTestUserCookie();
  if (cookie) return null;
  return React.createElement(React.Fragment, null, children);
}

// --------------- Button stubs ---------------

export function SignInButton({ children }: { children?: React.ReactNode }) {
  return React.createElement("div", null, children ?? "Sign In");
}

export function SignUpButton({ children }: { children?: React.ReactNode }) {
  return React.createElement("div", null, children ?? "Sign Up");
}

export function UserButton() {
  return null;
}

// --------------- re-exports that some files may expect ---------------

export function currentUser() {
  throw new Error(
    "clerk-mock: currentUser() is a server function. " +
      "Use lib/get-current-user.ts with x-test-user-* headers instead.",
  );
}

export function auth() {
  throw new Error(
    "clerk-mock: auth() is a server function. " +
      "Use the proxy.ts test bypass instead.",
  );
}

