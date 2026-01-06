"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import HeroSection from "@/components/landing/HeroSection";
import LogoCloud from "@/components/landing/LogoCloud";
import TestimonialSection from "@/components/landing/TestimonialSection";
import Footer from "@/components/landing/Footer";

export default function LandingPage() {
  const { isSignedIn, isLoaded, user } = useUser();
  const router = useRouter();

  // Get user role from metadata
  const userRole = (user?.unsafeMetadata?.role as string) || "student";

  // Auto-redirect logged-in users to their dashboard
  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn) {
      // Logged in - redirect based on role
      if (!user?.unsafeMetadata?.role) {
        router.replace("/onboarding");
      } else {
        switch (userRole) {
          case "instructor":
            router.replace("/instructor");
            break;
          case "student":
            router.replace("/student");
            break;
          case "admin":
            router.replace("/admin");
            break;
          default:
            router.replace("/student");
        }
      }
    }
  }, [isLoaded, isSignedIn, userRole, user, router]);

  // Show loading state while checking auth
  if (isLoaded && isSignedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">리다이렉트 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950/50">
      {/* Hero Section - AI 사고 과정 추적 */}
      <section id="hero">
        <HeroSection
          headline={
            <>
              <span className="text-strikethrough-bottom text-gray-800">
                AI 부정행위
              </span>
              <span className="text-gray-700 text-[68px]">
                , 막을 수 없다면
              </span>{" "}
              <br />
              <span className="gradient-animated-blue">평가의 일부</span>
              <span className="text-gray-700 text-[68px]">로 만드세요.</span>
            </>
          }
          subheadline={
            <>
              Quest-On은 생성형 AI를 '컨닝 도구'가 아닌 '사고력 파트너'로
              전환시킵니다.
              <br />
              결과만 보는 시험이 아니라, 사고하는 과정 전체를 평가합니다.
            </>
          }
        />
      </section>
      {/* Features Section - 실시간 평가 시스템 */}
      <section id="features">
        <TestimonialSection mode="light" />
      </section>
      {/* Partners Section - 파트너십 */}
      <LogoCloud mode="light" />
      {/* Footer */}
      <Footer mode="light" />
    </div>
  );
}
