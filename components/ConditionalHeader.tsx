"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";

export function ConditionalHeader() {
  const pathname = usePathname();

  // onboarding 페이지와 시험 페이지에서는 헤더를 숨김
  if (pathname === "/onboarding" || pathname.startsWith("/exam/")) {
    return null;
  }

  return <Header />;
}
