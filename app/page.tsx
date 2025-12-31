"use client";

import React, { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  Zap,
  TrendingUp,
  Target,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Star,
  BookOpen,
  Lightbulb,
  GraduationCap,
  FileText,
  HelpCircle,
  Building,
  Target as TargetIcon,
  Shield,
  Award,
  Mail,
} from "lucide-react";
import HeroSection from "@/components/landing/HeroSection";

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

  // Handle button click based on user state
  const handleQuestOnClick = () => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      // Not logged in - redirect to sign up
      router.push("/sign-up");
    } else {
      // Logged in - redirect based on role
      if (!user?.unsafeMetadata?.role) {
        router.push("/onboarding");
      } else {
        switch (userRole) {
          case "instructor":
            router.push("/instructor");
            break;
          case "student":
            router.push("/student");
            break;
          case "admin":
            router.push("/admin");
            break;
          default:
            router.push("/student");
        }
      }
    }
  };

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
    <div className="min-h-screen bg-[#FFFFFF] dark:bg-[#0A0A0A]">
      {/* Hero Section */}
      <div className="relative z-10">
        <HeroSection
          headline={
            <>
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">AI 부정행위</span>, 막을 수 없다면<br />
              <span className="text-zinc-900 dark:text-zinc-100">평가의 일부로 만드세요.</span>
            </>
          }
          subheadline="ChatGPT를 사용해도 좋습니다. Quest-On은 생성형 AI를 ‘컨닝 도구’가 아닌 ‘사고력 파트너’로 전환시킵니다. 결과만 보는 시험이 아니라, 사고하는 과정 전체를 평가합니다."
          ctaText="무료로 체험하기"
          onCtaClick={handleQuestOnClick}
        />
      </div>

      {/* About Section */}
      <section className="py-24 sm:py-32 bg-zinc-50 dark:bg-zinc-900/10 border-y border-zinc-200/50 dark:border-zinc-800/50">
        <div className="container mx-auto px-6">
          <div className="max-w-6xl mx-auto">
            {/* Mission Statement */}
            <div className="text-center mb-24">
              <div className="inline-flex items-center justify-center p-2 mb-8">
                <Image
                  src="/qlogo_icon.png"
                  alt="Quest-On 로고"
                  width={48}
                  height={48}
                  className="w-12 h-12"
                />
              </div>
              <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-8 text-zinc-900 dark:text-zinc-100">
                QUEST-ON
              </h2>
              <p className="text-xl sm:text-2xl text-zinc-500 dark:text-zinc-400 max-w-4xl mx-auto leading-relaxed font-medium">
                백년 넘게 이어진 객관식 평가 체제를 깨고, AI와 학생 간의 대화형
                시험을 통해 고등사고력과 실전 문제 해결 능력을 평가·배양하는
                차세대 교육 플랫폼입니다.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-8 mb-24">
              {/* Founding Background */}
              <div className="bg-white dark:bg-zinc-900/50 rounded-2xl p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all hover:shadow-md">
                <h3 className="text-xl font-bold mb-6 text-zinc-900 dark:text-zinc-100">설립 배경</h3>
                <div className="space-y-4 text-zinc-500 dark:text-zinc-400">
                  <p className="leading-relaxed">
                    QUEST-ON은 한 세기 넘게 이어져 온 기존 교육 평가 방식의
                    한계에서 출발했습니다.
                  </p>
                  <p className="leading-relaxed">
                    객관식 시험은 단순 암기력만을 측정할 뿐, 4차 산업혁명
                    시대가 요구하는 비판적 사고력과 창의적 문제 해결 능력을
                    평가하기에는 부족했습니다.
                  </p>
                </div>
              </div>

              {/* Why Now */}
              <div className="bg-white dark:bg-zinc-900/50 rounded-2xl p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all hover:shadow-md">
                <h3 className="text-xl font-bold mb-6 text-zinc-900 dark:text-zinc-100">Why Now?</h3>
                <div className="space-y-4 text-zinc-500 dark:text-zinc-400">
                  <p className="leading-relaxed">
                    ChatGPT와 같은 생성형 AI의 등장으로 전 세계 교육 방식이
                    근본적으로 변화했습니다.
                  </p>
                  <p className="leading-relaxed">
                    OECD와 WEF는 미래 인재에게 비판적 사고, 창의력, 문제
                    해결력을 강조하며, 우리는 그 결정적인 시점에 서 있습니다.
                  </p>
                </div>
              </div>
            </div>

            {/* Team Section */}
            <Card className="bg-gradient-to-r from-primary/5 to-chart-2/5 rounded-2xl shadow-lg border border-primary/10 mb-12 sm:mb-16">
              <CardContent className="p-6 sm:p-8 lg:p-12">
                <div className="text-center mb-6 sm:mb-8">
                  <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-primary/10 rounded-full mb-4 hover:bg-primary/15 transition-colors duration-200">
                    <Building
                      className="w-7 h-7 sm:w-8 sm:h-8 text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4">
                    Quest-On Team
                  </h3>
                  <blockquote className="text-lg sm:text-xl text-primary italic font-medium px-4">
                    &ldquo;AI를 배제할 것인가, 교육의 일부로 받아들일
                    것인가?&rdquo;
                  </blockquote>
                </div>

                <div className="grid md:grid-cols-2 gap-6 sm:gap-8 mt-6 sm:mt-8">
                  <Card className="bg-background/80 backdrop-blur-sm rounded-xl shadow-md border border-border/50 hover:shadow-lg transition-all duration-300">
                    <CardContent className="p-5 sm:p-6">
                      <h4 className="font-semibold text-base sm:text-lg mb-3 text-primary">
                        우리의 철학
                      </h4>
                      <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                        우리는 AI의 등장이 기존 평가 방식을 무력화시키는
                        위협이자, 동시에 새로운 기회가 될 수 있음을 보았습니다.
                      </p>
                      <p className="text-sm sm:text-base text-muted-foreground mt-3 font-medium leading-relaxed">
                        그 답은{" "}
                        <strong className="text-primary">
                          차단이 아닌, 통합
                        </strong>
                        에 있다고 믿습니다.
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-background/80 backdrop-blur-sm rounded-xl shadow-md border border-border/50 hover:shadow-lg transition-all duration-300">
                    <CardContent className="p-5 sm:p-6">
                      <h4 className="font-semibold text-base sm:text-lg mb-3 text-chart-2">
                        우리의 목표
                      </h4>
                      <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                        교육자와 학생 모두가{" "}
                        <strong className="text-chart-2">
                          공정하고 의미 있는 평가 경험
                        </strong>
                        을 누릴 수 있도록, AI와의 상호작용을 바탕으로 한 새로운
                        시험 환경을 설계합니다.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            {/* Vision */}
            <div className="bg-zinc-900 dark:bg-zinc-800 rounded-3xl p-12 sm:p-16 text-center text-white">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-full mb-8">
                <Target className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-3xl sm:text-4xl font-bold mb-6">우리의 비전</h3>
              <p className="text-lg text-zinc-400 max-w-2xl mx-auto mb-16 leading-relaxed">
                미래 교육의 새로운 패러다임을 제시하며, 인공지능 시대에 걸맞은
                가장 신뢰받는 평가 생태계를 구축합니다.
              </p>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-left">
                  <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center mb-4">
                    <TargetIcon className="w-5 h-5 text-white" />
                  </div>
                  <h4 className="font-bold mb-2">새로운 패러다임</h4>
                  <p className="text-sm text-zinc-500">AI 시대에 걸맞은 새로운 시험 평가 패러다임 정립</p>
                </div>
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-left">
                  <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center mb-4">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <h4 className="font-bold mb-2">신뢰와 투명성</h4>
                  <p className="text-sm text-zinc-500">교육 현장의 신뢰성과 투명성 확보</p>
                </div>
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-left">
                  <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center mb-4">
                    <Award className="w-5 h-5 text-white" />
                  </div>
                  <h4 className="font-bold mb-2">최적의 환경</h4>
                  <p className="text-sm text-zinc-500">학생의 역량을 100% 발휘할 수 있는 환경 제공</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI Features Section */}
      <section className="py-24 sm:py-32">
        <div className="container mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-zinc-900 dark:text-zinc-100 italic tracking-tight">AI Core Features</h2>
            <p className="text-lg text-zinc-500 max-w-2xl mx-auto leading-relaxed">
              최첨단 AI 기술로 교육 과정을 혁신하고, 더욱 효과적인 평가 환경을 제공합니다.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <div className="group p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:border-blue-500/50 transition-all">
              <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-500/10 group-hover:text-blue-500 transition-colors">
                <Brain className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-zinc-900 dark:text-zinc-100">실시간 AI 피드백</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">학생의 답변을 실시간으로 분석하여 고차원적 사고를 유도하는 개인화된 피드백을 제공합니다.</p>
            </div>
            <div className="group p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:border-purple-500/50 transition-all">
              <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center mb-6 group-hover:bg-purple-500/10 group-hover:text-purple-500 transition-colors">
                <Target className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-zinc-900 dark:text-zinc-100">스마트 평가 시스템</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">AI가 단순 결과가 아닌 해결 로직을 평가하여 응답 패턴 분석 및 맞춤형 성취도를 도출합니다.</p>
            </div>
            <div className="group p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:border-pink-500/50 transition-all sm:col-span-2 lg:col-span-1">
              <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center mb-6 group-hover:bg-pink-500/10 group-hover:text-pink-500 transition-colors">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-zinc-900 dark:text-zinc-100">인사이트 대시보드</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">학생들의 사고 데이터를 시각화하여 교수자에게 학습 성과에 대한 심층적인 인사이트를 제공합니다.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 sm:py-32 bg-zinc-50 dark:bg-zinc-900/10 border-y border-zinc-200/50 dark:border-zinc-800/50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-zinc-900 dark:text-zinc-100 italic tracking-tight">Onboarding Process</h2>
            <p className="text-lg text-zinc-500 max-w-2xl mx-auto leading-relaxed">
              몇 분 만에 AI 기반 평가 환경을 구축할 수 있습니다.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-12 max-w-5xl mx-auto">
            <div className="text-center group">
              <div className="w-14 h-14 bg-zinc-900 dark:bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-8 text-white dark:text-black text-xl font-bold shadow-sm group-hover:scale-110 transition-transform">
                1
              </div>
              <h3 className="text-xl font-bold mb-4 text-zinc-900 dark:text-zinc-100">시험 생성</h3>
              <p className="text-sm text-zinc-500 leading-relaxed px-4">
                AI 도움을 받아 쉽고 빠르게 시험을 생성하세요. 다양한 문제 유형과 난이도를 자유롭게 설정할 수 있습니다.
              </p>
            </div>
            <div className="text-center group">
              <div className="w-14 h-14 bg-zinc-900 dark:bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-8 text-white dark:text-black text-xl font-bold shadow-sm group-hover:scale-110 transition-transform">
                2
              </div>
              <h3 className="text-xl font-bold mb-4 text-zinc-900 dark:text-zinc-100">코드 공유</h3>
              <p className="text-sm text-zinc-500 leading-relaxed px-4">
                생성된 시험 코드를 학생들과 공유하세요. 간단한 코드 입력으로 누구나 즉각 참여할 수 있습니다.
              </p>
            </div>
            <div className="text-center group sm:col-span-2 lg:col-span-1">
              <div className="w-14 h-14 bg-zinc-900 dark:bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-8 text-white dark:text-black text-xl font-bold shadow-sm group-hover:scale-110 transition-transform">
                3
              </div>
              <h3 className="text-xl font-bold mb-4 text-zinc-900 dark:text-zinc-100">AI 분석</h3>
              <p className="text-sm text-zinc-500 leading-relaxed px-4">
                실시간으로 학생들의 답변을 분석하고, AI가 제공하는 다각도 인사이트로 학습 효과를 극대화하세요.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 sm:py-32">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center max-w-6xl mx-auto">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-12 text-zinc-900 dark:text-zinc-100">
                왜 Quest-On을<br />선택해야 할까요?
              </h2>
              <div className="space-y-10">
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded-full border border-green-500/50 flex items-center justify-center shrink-0 mt-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                  </div>
                  <div>
                    <h3 className="font-bold mb-2 text-zinc-900 dark:text-zinc-100">AI 기반 시험 출제 & 관리</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">교수자는 손쉽게 시험을 설계하고 자동화된 관리를 통해 단순 업무 시간을 대폭 절감할 수 있습니다.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded-full border border-blue-500/50 flex items-center justify-center shrink-0 mt-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-bold mb-2 text-zinc-900 dark:text-zinc-100">사고 중심 대화형 경험</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">학생은 문제 풀이 중 AI와 상호작용하며 단순 암기를 넘어 고등 사고력을 정교하게 발달시킵니다.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded-full border border-purple-500/50 flex items-center justify-center shrink-0 mt-1">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                  </div>
                  <div>
                    <h3 className="font-bold mb-2 text-zinc-900 dark:text-zinc-100">실시간 피드백 시스템</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">AI가 답변 패턴을 즉각 분석하여 적절한 시점에 힌트와 보조 지표를 제공, 평가의 질을 높입니다.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-8 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-center">
                <BookOpen className="w-10 h-10 text-zinc-900 dark:text-zinc-100 mx-auto mb-4" />
                <div className="text-xl font-bold mb-1">교수자 중심</div>
                <div className="text-xs text-zinc-500">효율적인 관리 공정</div>
              </div>
              <div className="p-8 rounded-2xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black text-center">
                <GraduationCap className="w-10 h-10 mx-auto mb-4" />
                <div className="text-xl font-bold mb-1">학생 중심</div>
                <div className="text-xs opacity-60">자기주도적 사고 확장</div>
              </div>
              <div className="p-8 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-center">
                <Zap className="w-10 h-10 text-zinc-900 dark:text-zinc-100 mx-auto mb-4" />
                <div className="text-xl font-bold mb-1">실시간 지원</div>
                <div className="text-xs text-zinc-500">초단위 피드백 메커니즘</div>
              </div>
              <div className="p-8 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center">
                <Star className="w-10 h-10 text-zinc-900 dark:text-zinc-100 mx-auto mb-4" />
                <div className="text-xl font-bold mb-1">Beta 서비스</div>
                <div className="text-xs text-zinc-500">지속적인 사용자 최적화</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* User Type Selection */}
      <section className="py-24 sm:py-32 bg-zinc-50 dark:bg-zinc-900/10 border-y border-zinc-200/50 dark:border-zinc-800/50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-zinc-900 dark:text-zinc-100 italic tracking-tight">Role Selection</h2>
            <p className="text-lg text-zinc-500 max-w-2xl mx-auto leading-relaxed">
              사용자 역할에 맞는 최적화된 경험을 제공합니다.
            </p>
          </div>

          <div
            className={`grid gap-8 max-w-4xl mx-auto ${!isSignedIn || userRole === "instructor"
              ? "sm:grid-cols-2"
              : "sm:grid-cols-1"
              }`}
          >
            {(!isSignedIn || userRole === "instructor") && (
              <div className="p-10 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex flex-col items-center text-center shadow-sm">
                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mb-8">
                  <BookOpen className="w-8 h-8 text-zinc-900 dark:text-zinc-100" />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-zinc-900 dark:text-zinc-100">강사용</h3>
                <p className="text-sm text-zinc-500 mb-8 leading-relaxed">
                  AI 도움을 받아 효율적으로 시험을 설계하고,<br />학생들의 실시간 사고 과정 데이터를 분석하세요.
                </p>
                <Link href="/instructor" className="w-full">
                  <Button
                    size="lg"
                    className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black hover:opacity-90 transition-opacity font-bold py-6 rounded-2xl shadow-lg"
                  >
                    강사 대시보드
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              </div>
            )}

            <div className="p-10 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex flex-col items-center text-center shadow-sm">
              <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mb-8">
                <Lightbulb className="w-8 h-8 text-zinc-900 dark:text-zinc-100" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-zinc-900 dark:text-zinc-100">학생용</h3>
              <p className="text-sm text-zinc-500 mb-8 leading-relaxed">
                AI 피드백과 함께 사고력을 확장하는<br />새로운 차원의 대화형 평가를 경험하세요.
              </p>
              <Link href="/join" className="w-full">
                <Button
                  size="lg"
                  className="w-full bg-blue-500 text-white hover:bg-blue-600 transition-colors font-bold py-6 rounded-2xl shadow-lg"
                >
                  시험 코드 입력
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-24 sm:py-32">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-zinc-900 dark:text-zinc-100 italic tracking-tight">Connect With Us</h2>
              <p className="text-lg text-zinc-500 max-w-2xl mx-auto leading-relaxed">
                Quest-On의 발전을 위해 여러분의 소중한 참여를 기다립니다.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-8">
              <div className="group p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-white dark:hover:bg-zinc-900 transition-all text-center">
                <div className="w-14 h-14 bg-white dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform shadow-sm">
                  <BookOpen className="w-7 h-7 text-zinc-900 dark:text-zinc-100" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-zinc-900 dark:text-zinc-100">교수님 신청</h3>
                <p className="text-sm text-zinc-500 mb-6 leading-relaxed">준비된 Beta 버전을 가장 먼저 도입하고<br />교육 혁신에 동참하세요.</p>
                <a
                  href="mailto:instructor@quest-on.com"
                  className="inline-flex items-center justify-center w-full py-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black rounded-xl font-bold hover:opacity-90 transition-opacity"
                >
                  참여 신청하기
                </a>
              </div>

              <div className="group p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-white dark:hover:bg-zinc-900 transition-all text-center">
                <div className="w-14 h-14 bg-white dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform shadow-sm">
                  <Lightbulb className="w-7 h-7 text-zinc-900 dark:text-zinc-100" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-zinc-900 dark:text-zinc-100">피드백 제안</h3>
                <p className="text-sm text-zinc-500 mb-6 leading-relaxed">사용 경험과 개선사항에 대한<br />여러분의 목소리를 소중히 듣겠습니다.</p>
                <a
                  href="mailto:feedback@quest-on.com"
                  className="inline-flex items-center justify-center w-full py-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black rounded-xl font-bold hover:opacity-90 transition-opacity"
                >
                  의언 보내기
                </a>
              </div>
            </div>

            <div className="mt-16 pt-8 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-zinc-400">
              <span className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                General Inquiry:
              </span>
              <a href="mailto:questonkr@gmail.com" className="text-zinc-900 dark:text-zinc-100 font-medium hover:underline">
                questonkr@gmail.com
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
