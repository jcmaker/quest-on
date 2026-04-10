"use client";

import { usePathname } from "next/navigation";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { Header } from "./Header";

/**
 * Pathname-only check first to avoid unnecessary auth calls
 * on routes that always hide the header.
 */
export function ConditionalHeader() {
  const pathname = usePathname();

  // Routes that always hide the header
  if (
    pathname === "/onboarding" ||
    pathname.startsWith("/exam/") ||
    pathname.startsWith("/assignment/") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up")
  ) {
    return null;
  }

  return <RoleAwareHeader pathname={pathname} />;
}

function RoleAwareHeader({ pathname }: { pathname: string }) {
  const { isSignedIn, isLoaded, profile } = useAppUser();

  if (isLoaded && isSignedIn && profile?.role) {
    const userRole = profile.role;

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
