"use client";

import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Header } from "./Header";

/**
 * Pathname-only check first to avoid unnecessary useUser() calls
 * on routes that always hide the header.
 */
export function ConditionalHeader() {
  const pathname = usePathname();

  // Routes that always hide the header — no Clerk call needed
  if (
    pathname === "/onboarding" ||
    pathname.startsWith("/exam/") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up")
  ) {
    return null;
  }

  return <RoleAwareHeader pathname={pathname} />;
}

/**
 * Only mounted on routes that *may* show the header,
 * so useUser() is skipped on /exam/*, /sign-in*, etc.
 */
function RoleAwareHeader({ pathname }: { pathname: string }) {
  const { isSignedIn, isLoaded, user } = useUser();

  if (isLoaded && isSignedIn && user?.unsafeMetadata?.role) {
    const userRole = user.unsafeMetadata.role as string;

    if (userRole === "student") {
      if (
        pathname.startsWith("/student") ||
        pathname.startsWith("/join") ||
        pathname.startsWith("/profile")
      ) {
        return null;
      }
    }

    if (userRole === "instructor") {
      if (pathname.startsWith("/instructor") || pathname.startsWith("/admin")) {
        return null;
      }
    }
  }

  return <Header />;
}
