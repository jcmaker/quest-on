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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950/50">
      {/* Hero Section */}
      <section className="relative overflow-hidden text-foreground min-h-screen">
        {/* Animated Background Elements */}
        <div className="absolute inset-0">
          {/* Floating Particles */}
          {/* <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-white/20 rounded-full animate-pulse"></div>
          <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-white/30 rounded-full animate-bounce"></div>
          <div className="absolute top-2/3 left-1/2 w-3 h-3 bg-white/10 rounded-full animate-pulse"></div>
          <div className="absolute top-1/2 right-1/4 w-1.5 h-1.5 bg-white/25 rounded-full animate-bounce"></div>
          <div className="absolute bottom-1/4 left-1/3 w-2.5 h-2.5 bg-white/15 rounded-full animate-pulse"></div> */}

          {/* Geometric Shapes */}
          {/* <div
            className="absolute top-20 left-20 w-20 h-20 border border-white/10 rotate-45 animate-spin"
            style={{ animationDuration: "20s" }}
          ></div>
          <div className="absolute top-40 right-32 w-16 h-16 border border-white/20 rounded-full animate-pulse"></div>
          <div
            className="absolute bottom-32 left-16 w-24 h-24 border border-white/5 rotate-12 animate-spin"
            style={{ animationDuration: "15s" }}
          ></div>
          <div className="absolute bottom-20 right-20 w-12 h-12 bg-white/5 rotate-45 animate-bounce"></div> */}

          {/* Gradient Orbs */}
          <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-gradient-to-r from-chart-1/20 to-chart-2/20 rounded-full blur-3xl animate-pulse"></div>
          <div
            className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-chart-3/15 to-primary/15 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "1s" }}
          ></div>
          <div
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-gradient-to-r from-chart-2/10 to-chart-1/10 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "2s" }}
          ></div>
        </div>

        {/* Animated Grid Pattern */}
        {/* <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)`,
              backgroundSize: "50px 50px",
            }}
          ></div>
        </div> */}

        {/* Moving Light Rays */}
        {/* <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-white/20 to-transparent animate-pulse"></div>
          <div
            className="absolute top-0 right-1/3 w-px h-full bg-gradient-to-b from-transparent via-white/15 to-transparent animate-pulse"
            style={{ animationDelay: "1s" }}
          ></div>
          <div
            className="absolute top-0 left-2/3 w-px h-full bg-gradient-to-b from-transparent via-white/10 to-transparent animate-pulse"
            style={{ animationDelay: "2s" }}
          ></div>
        </div> */}

        {/* AI Neural Network Pattern */}
        <div className="absolute inset-0 opacity-20">
          <svg
            className="w-full h-full"
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern
                id="neural-net"
                x="0"
                y="0"
                width="10"
                height="10"
                patternUnits="userSpaceOnUse"
              >
                <circle
                  cx="2"
                  cy="2"
                  r="1"
                  fill="white"
                  opacity="0.3"
                  className="animate-pulse"
                ></circle>
                <circle
                  cx="8"
                  cy="8"
                  r="1"
                  fill="white"
                  opacity="0.3"
                  className="animate-pulse"
                  style={{ animationDelay: "0.5s" }}
                ></circle>
                <line
                  x1="2"
                  y1="2"
                  x2="8"
                  y2="8"
                  stroke="white"
                  strokeWidth="0.5"
                  opacity="0.2"
                ></line>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#neural-net)"></rect>
          </svg>
        </div>

        {/* Floating AI Icons */}
        {/* <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-1/3 right-1/4 animate-float"
            style={{ animationDelay: "0s" }}
          >
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <Brain className="w-4 h-4 text-white/60" />
            </div>
          </div>
          <div
            className="absolute top-2/3 left-1/3 animate-float"
            style={{ animationDelay: "1s" }}
          >
            <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm">
              <Zap className="w-3 h-3 text-white/60" />
            </div>
          </div>
          <div
            className="absolute bottom-1/3 right-1/3 animate-float"
            style={{ animationDelay: "2s" }}
          >
            <div className="w-7 h-7 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <Target className="w-4 h-4 text-white/60" />
            </div>
          </div>
        </div> */}

        <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32 min-h-screen flex items-center">
          <div className="text-center max-w-5xl mx-auto w-full">
            <Badge
              variant="secondary"
              className="mb-6 sm:mb-8 bg-transparent text-foreground transition-all duration-200 animate-fade-in-up px-4 py-2 text-sm sm:text-base min-h-[44px] inline-flex items-center"
              style={{ animationDelay: "0.2s" }}
              aria-label="AI 기반 시험 출제 및 대화형 평가 플랫폼"
            >
              <Sparkles
                className="w-4 h-4 sm:w-5 sm:h-5 mr-2 animate-pulse"
                aria-hidden="true"
              />
              AI 기반 시험 출제 & 대화형 평가 플랫폼
            </Badge>
            <h1
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-cyan-300 via-blue-500 to-purple-600 bg-clip-text text-transparent animate-fade-in-up leading-tight"
              style={{
                animationDelay: "0.4s",
                backgroundSize: "200% 200%",
                animation:
                  "fade-in-up 1s ease-out 0.4s both, gradient-shift 5s ease-in-out infinite",
              }}
            >
              Quest-On
            </h1>
            <h2
              className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-6 sm:mb-8 text-foreground animate-fade-in-up leading-tight px-4"
              style={{ animationDelay: "0.6s" }}
            >
              AI와 함께하는 새로운 시험 경험
            </h2>
            <p
              className="text-base sm:text-lg md:text-xl lg:text-2xl text-muted-foreground mb-8 sm:mb-12 max-w-3xl mx-auto leading-relaxed animate-fade-in-up px-4"
              style={{ animationDelay: "0.8s" }}
            >
              교수자는 쉽게 시험을 출제하고, 학생은 AI와 대화하며 새로운 평가를
              경험합니다. 전통적인 시험의 한계를 넘어서는 혁신적인 평가 방법을
              만나보세요.
            </p>
            <div
              className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-12 animate-fade-in-up px-4"
              style={{ animationDelay: "1s" }}
            >
              <Button
                onClick={handleQuestOnClick}
                size="lg"
                className="w-full sm:w-auto bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white hover:scale-105 hover:shadow-xl transition-all duration-300 text-base sm:text-lg px-8 sm:px-12 py-6 sm:py-4 group min-h-[56px] sm:min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                aria-label="Quest-On 이용해보기"
              >
                <Sparkles
                  className="w-5 h-5 mr-2 group-hover:animate-bounce"
                  aria-hidden="true"
                />
                Quest-on 이용해보기
                <ArrowRight
                  className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform duration-300"
                  aria-hidden="true"
                />
              </Button>
            </div>
          </div>
        </div>

        {/* Bottom Gradient Transition */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background via-background/50 to-transparent dark:from-background dark:via-background/50"></div>

        {/* Interactive Mouse Follow Effect */}
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-white/5 rounded-full animate-pulse blur-3xl"></div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-16 sm:py-20 lg:py-24 bg-muted/50 dark:bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            {/* Mission Statement */}
            <div className="text-center mb-12 sm:mb-16 lg:mb-20">
              <div className="inline-flex items-center justify-center p-3 sm:p-4 bg-primary/10 rounded-full mb-6 sm:mb-8 hover:bg-primary/15 transition-colors duration-200">
                <Image
                  src="/qlogo_icon.png"
                  alt="Quest-On 로고"
                  width={40}
                  height={40}
                  className="mr-2 sm:mr-3 w-8 h-8 sm:w-10 sm:h-10"
                />
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-primary">
                  QUEST-ON
                </h2>
              </div>
              <p className="text-lg sm:text-xl lg:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed font-medium px-4">
                백년 넘게 이어진 객관식 평가 체제를 깨고, AI와 학생 간의 대화형
                시험을 통해 고등사고력과 실전 문제 해결 능력을 평가·배양하는
                차세대 교육 플랫폼입니다.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 mb-12 sm:mb-16 lg:mb-20">
              {/* Founding Background */}
              <Card className="bg-background rounded-2xl shadow-lg border border-border/50 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                <CardHeader className="pb-4">
                  <div className="flex items-center mb-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mr-4 shrink-0">
                      <FileText
                        className="w-6 h-6 text-primary"
                        aria-hidden="true"
                      />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold">설립 배경</h3>
                  </div>
                  <blockquote className="text-base sm:text-lg text-primary italic mb-4 sm:mb-6 border-l-4 border-primary pl-4 leading-relaxed">
                    QUEST-ON은 한 세기 넘게 이어져 온 기존 교육 평가 방식의
                    한계에서 출발했습니다.
                  </blockquote>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 sm:space-y-4 text-muted-foreground">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"
                        aria-hidden="true"
                      ></div>
                      <p className="text-sm sm:text-base leading-relaxed">
                        객관식 시험은 단순 암기력만을 측정할 뿐, 4차 산업혁명
                        시대가 요구하는 비판적 사고력과 창의적 문제 해결 능력을
                        평가하기에는 부족했습니다.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div
                        className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"
                        aria-hidden="true"
                      ></div>
                      <p className="text-sm sm:text-base leading-relaxed">
                        이를 극복하기 위해 2025년, 저희는 AI 기술과 교육학적
                        접근을 결합한 새로운 평가 시스템을 개발했습니다.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div
                        className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"
                        aria-hidden="true"
                      ></div>
                      <p className="text-sm sm:text-base leading-relaxed">
                        창업팀은 교육자와 AI 전문가들로 이루어져 있으며, 교육
                        현장에서 직접 경험한 문제의식을 바탕으로 학생들의 실제
                        역량을 평가하고 향상시킬 수 있는 솔루션을 만들어가고
                        있습니다.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Why Now */}
              <Card className="bg-background rounded-2xl shadow-lg border border-border/50 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                <CardHeader className="pb-4">
                  <div className="flex items-center mb-4">
                    <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center mr-4 shrink-0">
                      <HelpCircle
                        className="w-6 h-6 text-chart-2"
                        aria-hidden="true"
                      />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold">Why Now?</h3>
                  </div>
                  <blockquote className="text-base sm:text-lg text-chart-2 italic mb-4 sm:mb-6 border-l-4 border-chart-2 pl-4 leading-relaxed">
                    암기식 시험은 더 이상 학생들의 사고력과 창의성을 평가하지
                    못하고 있습니다.
                  </blockquote>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 sm:space-y-4 text-muted-foreground">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-2 h-2 bg-chart-2 rounded-full mt-2 flex-shrink-0"
                        aria-hidden="true"
                      ></div>
                      <p className="text-sm sm:text-base leading-relaxed">
                        ChatGPT와 같은 생성형 AI의 등장으로 전 세계 교육 방식이
                        근본적으로 변화했습니다.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div
                        className="w-2 h-2 bg-chart-2 rounded-full mt-2 flex-shrink-0"
                        aria-hidden="true"
                      ></div>
                      <p className="text-sm sm:text-base leading-relaxed">
                        OECD와 WEF는 미래 인재에게 비판적 사고, 창의력, 문제
                        해결력을 강조합니다.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div
                        className="w-2 h-2 bg-chart-2 rounded-full mt-2 flex-shrink-0"
                        aria-hidden="true"
                      ></div>
                      <p className="text-sm sm:text-base leading-relaxed">
                        글로벌 에듀테크 시장이 폭발적으로 성장하고 있는 결정적인
                        시기입니다.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
            <Card className="bg-background rounded-2xl shadow-xl border border-border/50">
              <CardContent className="p-8 sm:p-10 lg:p-12">
                <div className="text-center mb-6 sm:mb-8">
                  <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-chart-3/10 rounded-full mb-4 hover:bg-chart-3/15 transition-colors duration-200">
                    <Target
                      className="w-7 h-7 sm:w-8 sm:h-8 text-chart-3"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold mb-2">
                    우리의 비전
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground mt-2 px-4">
                    미래 교육의 새로운 패러다임을 제시합니다
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  <Card className="text-center p-5 sm:p-6 rounded-xl bg-primary/5 border border-primary/20 hover:bg-primary/10 hover:shadow-md transition-all duration-300">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <TargetIcon
                        className="w-6 h-6 text-primary"
                        aria-hidden="true"
                      />
                    </div>
                    <h4 className="font-semibold mb-2 text-sm sm:text-base">
                      새로운 패러다임
                    </h4>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      AI 시대에 걸맞은 새로운 시험 평가 패러다임 정립
                    </p>
                  </Card>
                  <Card className="text-center p-5 sm:p-6 rounded-xl bg-chart-2/5 border border-chart-2/20 hover:bg-chart-2/10 hover:shadow-md transition-all duration-300">
                    <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <Shield
                        className="w-6 h-6 text-chart-2"
                        aria-hidden="true"
                      />
                    </div>
                    <h4 className="font-semibold mb-2 text-sm sm:text-base">
                      신뢰와 투명성
                    </h4>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      교육 현장의 신뢰성과 투명성 확보
                    </p>
                  </Card>
                  <Card className="text-center p-5 sm:p-6 rounded-xl bg-chart-3/5 border border-chart-3/20 hover:bg-chart-3/10 hover:shadow-md transition-all duration-300 sm:col-span-2 lg:col-span-1">
                    <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <Award
                        className="w-6 h-6 text-chart-3"
                        aria-hidden="true"
                      />
                    </div>
                    <h4 className="font-semibold mb-2 text-sm sm:text-base">
                      최적의 환경
                    </h4>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      학생의 역량을 100% 발휘할 수 있는 환경 제공
                    </p>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* AI Features Section */}
      <section className="py-16 sm:py-20 lg:py-24 bg-background dark:bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3 sm:mb-4 px-4">
              AI 기반 혁신 기능
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto px-4 leading-relaxed">
              최첨단 AI 기술로 교육 과정을 혁신하고, 더욱 효과적인 평가 환경을
              제공합니다
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            <Card className="p-6 sm:p-8 hover:shadow-xl transition-all duration-300 border border-border/50 bg-gradient-to-br from-muted/50 to-accent/30 dark:from-muted/30 dark:to-accent/20 hover:-translate-y-1">
              <CardHeader className="pb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Brain className="w-6 h-6 text-primary" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg sm:text-xl mb-2">
                  실시간 AI 피드백
                </CardTitle>
                <CardDescription className="text-sm sm:text-base leading-relaxed">
                  학생의 답변을 실시간으로 분석하여 개인화된 피드백을 제공합니다
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="p-6 sm:p-8 hover:shadow-xl transition-all duration-300 border border-border/50 bg-gradient-to-br from-secondary/30 to-muted/50 dark:from-secondary/20 dark:to-muted/30 hover:-translate-y-1">
              <CardHeader className="pb-4">
                <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center mb-4">
                  <Target className="w-6 h-6 text-chart-2" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg sm:text-xl mb-2">
                  스마트 채점 시스템
                </CardTitle>
                <CardDescription className="text-sm sm:text-base leading-relaxed">
                  AI가 자동으로 답변을 채점하고, 응답 패턴을 분석하여 맞춤형
                  평가 방법을 제안합니다
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="p-6 sm:p-8 hover:shadow-xl transition-all duration-300 border border-border/50 bg-gradient-to-br from-accent/30 to-secondary/30 dark:from-accent/20 dark:to-secondary/20 hover:-translate-y-1 sm:col-span-2 lg:col-span-1">
              <CardHeader className="pb-4">
                <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center mb-4">
                  <TrendingUp
                    className="w-6 h-6 text-chart-3"
                    aria-hidden="true"
                  />
                </div>
                <CardTitle className="text-lg sm:text-xl mb-2">
                  평가 분석 대시보드
                </CardTitle>
                <CardDescription className="text-sm sm:text-base leading-relaxed">
                  학생들의 평가 데이터를 실시간으로 분석하여 강사에게 인사이트를
                  제공합니다
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 sm:py-20 lg:py-24 bg-muted/50 dark:bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3 sm:mb-4 px-4">
              간단한 3단계로 시작하세요
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-muted-foreground px-4">
              몇 분만에 AI 기반 평가 환경을 구축할 수 있습니다
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10 max-w-5xl mx-auto">
            <Card className="text-center p-6 sm:p-8 hover:shadow-xl transition-all duration-300 border border-border/50 bg-background hover:-translate-y-1">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-6 text-primary-foreground text-2xl font-bold shadow-lg">
                1
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">
                시험 생성
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                AI 도움을 받아 쉽고 빠르게 시험을 생성하세요. 다양한 문제 유형과
                난이도를 설정할 수 있습니다.
              </p>
            </Card>
            <Card className="text-center p-6 sm:p-8 hover:shadow-xl transition-all duration-300 border border-border/50 bg-background hover:-translate-y-1">
              <div className="w-16 h-16 bg-chart-2 rounded-full flex items-center justify-center mx-auto mb-6 text-primary-foreground text-2xl font-bold shadow-lg">
                2
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">
                코드 공유
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                생성된 시험 코드를 학생들과 공유하세요. 간단한 코드 입력으로
                누구나 참여할 수 있습니다.
              </p>
            </Card>
            <Card className="text-center p-6 sm:p-8 hover:shadow-xl transition-all duration-300 border border-border/50 bg-background hover:-translate-y-1 sm:col-span-2 lg:col-span-1">
              <div className="w-16 h-16 bg-chart-3 rounded-full flex items-center justify-center mx-auto mb-6 text-primary-foreground text-2xl font-bold shadow-lg">
                3
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">
                AI 분석
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                실시간으로 학생들의 답변을 분석하고, AI가 제공하는 인사이트로
                학습 효과를 극대화하세요.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 sm:py-20 lg:py-24 bg-background dark:bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-6 sm:mb-8 px-4 lg:px-0">
                왜 Quest-On을 선택해야 할까요?
              </h2>
              <div className="space-y-5 sm:space-y-6">
                <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors duration-200">
                  <CheckCircle
                    className="w-6 h-6 text-green-600 mt-1 flex-shrink-0 min-w-[24px]"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="font-semibold mb-2 text-base sm:text-lg">
                      AI 기반 시험 출제 & 관리
                    </h3>
                    <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                      교수자는 손쉽게 시험을 만들고 관리할 수 있으며, 자동화된
                      채점과 피드백 제공으로 업무 부담을 줄여줍니다
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors duration-200">
                  <CheckCircle
                    className="w-6 h-6 text-green-600 mt-1 flex-shrink-0 min-w-[24px]"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="font-semibold mb-2 text-base sm:text-lg">
                      학생 중심 대화형 시험 경험
                    </h3>
                    <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                      학생은 문제 풀이 중 AI와 질의응답을 주고받으며, 단순한
                      정답 맞추기를 넘어 개념 이해와 사고력을 기를 수 있습니다
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors duration-200">
                  <CheckCircle
                    className="w-6 h-6 text-green-600 mt-1 flex-shrink-0 min-w-[24px]"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="font-semibold mb-2 text-base sm:text-lg">
                      실시간 피드백 & 평가 강화
                    </h3>
                    <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                      AI가 학생의 답변을 분석하고 즉각적인 힌트를 제공하여 평가
                      효과를 극대화합니다
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors duration-200">
                  <CheckCircle
                    className="w-6 h-6 text-green-600 mt-1 flex-shrink-0 min-w-[24px]"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="font-semibold mb-2 text-base sm:text-lg">
                      새로운 시험 경험
                    </h3>
                    <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                      전통적인 시험의 한계를 넘어, AI가 함께하는 혁신적인 평가
                      방법을 경험해보세요
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <Card className="bg-gradient-to-br from-muted/80 to-accent/30 dark:from-muted/20 dark:to-accent/20 rounded-2xl shadow-xl border border-border/50 p-6 sm:p-8">
                <div className="grid grid-cols-2 gap-4 sm:gap-6">
                  <Card className="text-center p-4 sm:p-5 bg-background/50 rounded-xl border border-border/30 hover:bg-background/70 transition-colors duration-200">
                    <BookOpen
                      className="w-10 h-10 sm:w-12 sm:h-12 text-primary mx-auto mb-3 sm:mb-4"
                      aria-hidden="true"
                    />
                    <div className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">
                      교수자 중심
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      효율적인 시험 관리
                    </div>
                  </Card>
                  <Card className="text-center p-4 sm:p-5 bg-background/50 rounded-xl border border-border/30 hover:bg-background/70 transition-colors duration-200">
                    <GraduationCap
                      className="w-10 h-10 sm:w-12 sm:h-12 text-chart-2 mx-auto mb-3 sm:mb-4"
                      aria-hidden="true"
                    />
                    <div className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">
                      학생 중심
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      AI와 함께하는 평가
                    </div>
                  </Card>
                  <Card className="text-center p-4 sm:p-5 bg-background/50 rounded-xl border border-border/30 hover:bg-background/70 transition-colors duration-200">
                    <Zap
                      className="w-10 h-10 sm:w-12 sm:h-12 text-chart-3 mx-auto mb-3 sm:mb-4"
                      aria-hidden="true"
                    />
                    <div className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">
                      실시간 지원
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      빠른 피드백 제공
                    </div>
                  </Card>
                  <Card className="text-center p-4 sm:p-5 bg-background/50 rounded-xl border border-border/30 hover:bg-background/70 transition-colors duration-200">
                    <Star
                      className="w-10 h-10 sm:w-12 sm:h-12 text-chart-1 mx-auto mb-3 sm:mb-4"
                      aria-hidden="true"
                    />
                    <div className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">
                      Beta 진행 중
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      지속적 개선
                    </div>
                  </Card>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* User Type Selection */}
      <section className="py-16 sm:py-20 lg:py-24 bg-muted/50 dark:bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3 sm:mb-4 px-4">
              어떤 사용자이신가요?
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-muted-foreground px-4">
              귀하의 역할에 맞는 최적화된 경험을 제공합니다
            </p>
          </div>

          <div
            className={`grid gap-6 sm:gap-8 max-w-4xl mx-auto ${
              !isSignedIn || userRole === "instructor"
                ? "sm:grid-cols-2"
                : "sm:grid-cols-1"
            }`}
          >
            {(!isSignedIn || userRole === "instructor") && (
              <Card className="p-6 sm:p-8 text-center hover:shadow-xl transition-all duration-300 border border-border/50 bg-gradient-to-br from-muted/80 to-accent/30 dark:from-muted/50 dark:to-accent/20 hover:-translate-y-1">
                <CardHeader className="pb-4">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <BookOpen
                      className="w-7 h-7 sm:w-8 sm:h-8 text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <CardTitle className="text-xl sm:text-2xl mb-2">
                    강사용
                  </CardTitle>
                  <CardDescription className="text-base sm:text-lg leading-relaxed">
                    AI 도움을 받아 효율적으로 시험을 관리하고, 학생들의 평가를
                    분석하세요
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="text-left space-y-2 sm:space-y-3 mb-6 text-sm sm:text-base">
                    <li className="flex items-center gap-2 sm:gap-3">
                      <CheckCircle
                        className="w-5 h-5 text-chart-3 flex-shrink-0"
                        aria-hidden="true"
                      />
                      <span>AI 기반 시험 생성</span>
                    </li>
                    <li className="flex items-center gap-2 sm:gap-3">
                      <CheckCircle
                        className="w-5 h-5 text-chart-3 flex-shrink-0"
                        aria-hidden="true"
                      />
                      <span>다양한 시험 경험 제공</span>
                    </li>
                    <li className="flex items-center gap-2 sm:gap-3">
                      <CheckCircle
                        className="w-5 h-5 text-chart-3 flex-shrink-0"
                        aria-hidden="true"
                      />
                      <span>채점 도움 및 보고서</span>
                    </li>
                  </ul>
                  <Link href="/instructor" className="block">
                    <Button
                      size="lg"
                      className="w-full bg-primary hover:bg-primary/90 min-h-[56px] sm:min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                      aria-label="강사 대시보드로 이동"
                    >
                      강사 대시보드로 이동
                      <ArrowRight className="w-5 h-5 ml-2" aria-hidden="true" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            <Card className="p-6 sm:p-8 text-center hover:shadow-xl transition-all duration-300 border border-border/50 bg-gradient-to-br from-secondary/30 to-muted/80 dark:from-secondary/20 dark:to-muted/50 hover:-translate-y-1">
              <CardHeader className="pb-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-chart-2/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Lightbulb
                    className="w-7 h-7 sm:w-8 sm:h-8 text-chart-2"
                    aria-hidden="true"
                  />
                </div>
                <CardTitle className="text-xl sm:text-2xl mb-2">
                  학생용
                </CardTitle>
                <CardDescription className="text-base sm:text-lg leading-relaxed">
                  AI 피드백과 함께 개인화된 시험 경험을 즐기세요
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-left space-y-2 sm:space-y-3 mb-6 text-sm sm:text-base">
                  <li className="flex items-center gap-2 sm:gap-3">
                    <CheckCircle
                      className="w-5 h-5 text-chart-3 flex-shrink-0"
                      aria-hidden="true"
                    />
                    <span>실시간 AI 피드백</span>
                  </li>
                  <li className="flex items-center gap-2 sm:gap-3">
                    <CheckCircle
                      className="w-5 h-5 text-chart-3 flex-shrink-0"
                      aria-hidden="true"
                    />
                    <span>상호작용 시험</span>
                  </li>
                  <li className="flex items-center gap-2 sm:gap-3">
                    <CheckCircle
                      className="w-5 h-5 text-chart-3 flex-shrink-0"
                      aria-hidden="true"
                    />
                    <span>새로운 시험 경험</span>
                  </li>
                </ul>
                <Link href="/join" className="block">
                  <Button
                    size="lg"
                    className="w-full bg-chart-2 hover:bg-chart-2/90 min-h-[56px] sm:min-h-[48px] focus:outline-none focus:ring-2 focus:ring-chart-2 focus:ring-offset-2"
                    aria-label="시험 코드 입력 페이지로 이동"
                  >
                    시험 코드 입력
                    <ArrowRight className="w-5 h-5 ml-2" aria-hidden="true" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-16 sm:py-20 bg-gradient-to-r from-primary via-chart-2 to-chart-3 text-foreground">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-3 sm:mb-4 px-4">
                함께 만들어가요
              </h2>
              <p className="text-base sm:text-lg lg:text-xl text-muted max-w-2xl mx-auto px-4 leading-relaxed">
                Quest-On의 발전을 위해 여러분의 소중한 의견과 참여를 기다립니다
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto">
              {/* 교수님 신청 */}
              <Card className="group bg-background/95 backdrop-blur-sm rounded-2xl shadow-xl border border-border/50 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-6 sm:p-8 text-center">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6 group-hover:bg-primary/20 transition-colors duration-200">
                    <BookOpen
                      className="w-7 h-7 sm:w-8 sm:h-8 text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">
                    교수님 신청
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8 leading-relaxed">
                    Quest-On을 함께 만들어갈 교수님을 모집합니다.
                    <br className="hidden sm:block" />
                    <span className="sm:hidden"> </span>
                    교육 현장의 소중한 경험을 공유해주세요.
                  </p>
                  <a
                    href="mailto:instructor@quest-on.com?subject=Quest-On 교수님 신청&body=안녕하세요, Quest-On 교수님 신청드립니다.%0A%0A이름: %0A소속 기관: %0A연락처: %0A사용 목적: %0A기대 효과: %0A%0A감사합니다."
                    className="inline-flex items-center justify-center w-full px-6 sm:px-8 py-3 sm:py-4 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-all duration-200 hover:shadow-lg min-h-[56px] sm:min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                    aria-label="교수님 신청 이메일 보내기"
                  >
                    <BookOpen
                      className="w-5 h-5 mr-2 sm:mr-3"
                      aria-hidden="true"
                    />
                    교수님 신청하기
                  </a>
                </CardContent>
              </Card>

              {/* 피드백 보내기 */}
              <Card className="group bg-background/95 backdrop-blur-sm rounded-2xl shadow-xl border border-border/50 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-6 sm:p-8 text-center">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-chart-2/10 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6 group-hover:bg-chart-2/20 transition-colors duration-200">
                    <Lightbulb
                      className="w-7 h-7 sm:w-8 sm:h-8 text-chart-2"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">
                    피드백 보내기
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8 leading-relaxed">
                    Quest-On 사용 경험과 개선 제안사항을
                    <br className="hidden sm:block" />
                    <span className="sm:hidden"> </span>
                    언제든지 보내주세요. 소중한 의견이 큰 도움이 됩니다.
                  </p>
                  <a
                    href="mailto:feedback@quest-on.com?subject=Quest-On 피드백&body=안녕하세요, Quest-On에 대한 피드백입니다.%0A%0A사용자 유형 (교수자/학생): %0A%0A사용 경험: %0A%0A개선 제안사항: %0A%0A기타 의견: %0A%0A감사합니다."
                    className="inline-flex items-center justify-center w-full px-6 sm:px-8 py-3 sm:py-4 bg-chart-2 text-chart-2-foreground rounded-xl font-semibold hover:bg-chart-2/90 transition-all duration-200 hover:shadow-lg min-h-[56px] sm:min-h-[48px] focus:outline-none focus:ring-2 focus:ring-chart-2 focus:ring-offset-2 focus:ring-offset-background"
                    aria-label="피드백 이메일 보내기"
                  >
                    <Lightbulb
                      className="w-5 h-5 mr-2 sm:mr-3"
                      aria-hidden="true"
                    />
                    피드백 보내기
                  </a>
                </CardContent>
              </Card>
            </div>

            {/* Contact Info */}
            <div className="mt-12 sm:mt-16 text-center">
              <div className="inline-flex flex-col sm:flex-row items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-background/80 backdrop-blur-sm rounded-full border border-border/50 min-h-[44px]">
                <Mail
                  className="w-5 h-5 text-muted-foreground shrink-0"
                  aria-hidden="true"
                />
                <span className="text-sm sm:text-base text-muted-foreground">
                  일반 문의:
                </span>
                <a
                  href="mailto:questonkr@gmail.com"
                  className="text-sm sm:text-base text-foreground hover:text-primary transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background rounded px-2 py-1"
                  aria-label="일반 문의 이메일 보내기"
                >
                  questonkr@gmail.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
