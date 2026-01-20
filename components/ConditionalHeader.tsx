"use client";

import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Header } from "./Header";

export function ConditionalHeader() {
  const pathname = usePathname();
  const { isSignedIn, isLoaded, user } = useUser();

  // onboarding 페이지, 시험 페이지, 로그인/회원가입 페이지에서는 헤더를 숨김
  if (
    pathname === "/onboarding" ||
    pathname.startsWith("/exam/") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up")
  ) {
    return null;
  }

  // 로그인한 사용자(학생/강사)의 대시보드 관련 페이지에서는 헤더를 숨김
  // 사이드바를 사용하므로 헤더가 필요 없음
  if (isLoaded && isSignedIn && user?.unsafeMetadata?.role) {
    const userRole = user.unsafeMetadata.role as string;

    // 학생 경로
    if (userRole === "student") {
      if (
        pathname.startsWith("/student") ||
        pathname.startsWith("/join") ||
        pathname.startsWith("/profile")
      ) {
        return null;
      }
    }

    // 강사 경로
    if (userRole === "instructor") {
      if (pathname.startsWith("/instructor") || pathname.startsWith("/admin")) {
        return null;
      }
    }
  }

  return <Header />;
}
