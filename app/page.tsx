"use client";

import React, { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import LogoCloud from "@/components/landing/LogoCloud";

const HeroSection = dynamic(() => import("@/components/landing/HeroSection"), { ssr: false });
const FeatureSection = dynamic(() => import("@/components/landing/FeatureSection"), { ssr: false });
const TestimonialSection = dynamic(() => import("@/components/landing/TestimonialSection"), { ssr: false });
const CTASection = dynamic(() => import("@/components/landing/CTASection"), { ssr: false });
const Footer = dynamic(() => import("@/components/landing/Footer"), { ssr: false });

export default function LandingPage() {
  const { isSignedIn, isLoaded, user } = useUser();
  const router = useRouter();

  const userRole = (user?.unsafeMetadata?.role as string) || "student";

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      if (!user?.unsafeMetadata?.role) {
        router.replace("/onboarding");
      } else {
        switch (userRole) {
          case "instructor": router.replace("/instructor"); break;
          case "student": router.replace("/student"); break;
          case "admin": router.replace("/admin"); break;
          default: router.replace("/student");
        }
      }
    }
  }, [isLoaded, isSignedIn, userRole, user, router]);

  const handleQuestOnClick = () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push("/sign-up");
    } else {
      if (!user?.unsafeMetadata?.role) {
        router.push("/onboarding");
      } else {
        switch (userRole) {
          case "instructor": router.push("/instructor"); break;
          case "student": router.push("/student"); break;
          case "admin": router.push("/admin"); break;
          default: router.push("/student");
        }
      }
    }
  };

  if (isLoaded && isSignedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black font-sans">
        <div className="text-center space-y-6">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-zinc-500 font-bold tracking-tight">대시보드로 안전하게 이동 중...</p>
        </div>
      </div>
    );
  }

  // Use "light" mode as primary for a clean premium look similar to Cursor default
  const PAGE_MODE = "light";

  return (
    <div className="min-h-screen bg-white dark:bg-black selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden font-sans no-scrollbar">

      {/* 🚀 Hero Section - The Most Critical Build */}
      <HeroSection
        headline={
          <>
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">AI 부정행위</span>, 막을 수 없다면<br />
            <span className="text-gray-900">평가의 일부로 만드세요.</span>
          </>
        }
        subheadline="ChatGPT를 사용해도 좋습니다. Quest-On은 생성형 AI를 ‘컨닝 도구’가 아닌 ‘사고력 파트너’로 전환시킵니다. 결과만 보는 시험이 아니라, 사고하는 과정 전체를 평가합니다."
        ctaText="무료로 체험하기"
        onCtaClick={handleQuestOnClick}
        mode={PAGE_MODE}
      />

      {/* 🏛️ Social Proof: Institutional Partners */}
      <LogoCloud mode={PAGE_MODE} />

      {/* 💬 Social Proof: Expert Testimonials - Moved up as requested */}
      <div className="border-y border-zinc-50 dark:border-zinc-900">
        <TestimonialSection mode={PAGE_MODE} />
      </div>

      {/* ✨ Primary Features: Pixel-Perfect Real UI Mockups */}
      <FeatureSection mode={PAGE_MODE} />

      {/* 🏗️ Final Conversion: CTA Section */}
      <div className="border-t border-zinc-50 dark:border-zinc-900">
        <CTASection mode={PAGE_MODE} onCtaClick={handleQuestOnClick} />
      </div>

      {/* 🗺️ Site Map & Info: Comprehensive Footer */}
      <Footer mode={PAGE_MODE} />


    </div>
  );
}
