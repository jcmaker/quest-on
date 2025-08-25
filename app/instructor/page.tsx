"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignedIn, SignedOut, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  GraduationCap,
  BookOpen,
  Users,
  // BarChart3,
  Settings,
  Plus,
  FileText,
  Calendar,
} from "lucide-react";

export default function InstructorHome() {
  const router = useRouter();
  const { isSignedIn, isLoaded, user } = useUser();

  // Get user role from metadata
  const userRole = (user?.unsafeMetadata?.role as string) || "student";

  // Redirect non-instructors
  useEffect(() => {
    if (isLoaded && isSignedIn && userRole !== "instructor") {
      router.push("/student");
    }
  }, [isLoaded, isSignedIn, userRole, router]);

  return (
    <div className="min-h-screen bg-background">
      <SignedOut>
        <div className="flex items-center justify-center h-screen">
          <Card className="w-full max-w-md shadow-xl border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="text-center space-y-4">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
                <GraduationCap className="w-8 h-8 text-primary-foreground" />
              </div>
              <CardTitle className="text-xl">로그인이 필요합니다</CardTitle>
              <p className="text-sm text-muted-foreground">
                강사 페이지에 접근하려면 로그인해주세요
              </p>
            </CardHeader>
            <CardContent className="text-center pb-8">
              <Button
                onClick={() => router.replace("/sign-in")}
                className="w-full"
              >
                강사로 로그인
              </Button>
            </CardContent>
          </Card>
        </div>
      </SignedOut>

      <SignedIn>
        {/* Header */}
        <header className="bg-card/80 backdrop-blur-sm border-b border-border shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">
                    강사 콘솔
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    AI 시험 플랫폼 관리
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Badge
                  variant="outline"
                  className="bg-primary/10 text-primary border-primary/20"
                >
                  강사 모드
                </Badge>
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4 mr-2" />
                  설정
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto p-6 space-y-8">
          {/* Welcome Section */}
          <Card className="border-0 shadow-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
            <CardContent className="p-8">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">안녕하세요, 강사님!</h2>
                  <p className="text-primary-foreground/80">
                    AI 기반 인터랙티브 시험을 생성하고 관리하세요
                  </p>
                </div>
                <div className="hidden md:block">
                  <BookOpen className="w-16 h-16 text-primary-foreground/60" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link href="/instructor/new">
              <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer group">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200">
                    <Plus className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">
                    새 시험 생성
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    AI 기반 인터랙티브 시험 만들기
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/instructor/exams">
              <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer group">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">
                    시험 관리
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    기존 시험 편집 및 관리
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer group">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">
                  학생 관리
                </h3>
                <p className="text-sm text-muted-foreground">
                  학생 성적 및 진행상황 확인
                </p>
              </CardContent>
            </Card>

            {/* <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer group">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">
                  분석 리포트
                </h3>
                <p className="text-sm text-muted-foreground">
                  성적 분석 및 통계 확인
                </p>
              </CardContent>
            </Card> */}
          </div>

          {/* Main Action */}
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-primary" />
                <span>시험 출제</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                AI 기반 인터랙티브 시험을 생성하고 학생들에게 배포하세요. 실시간
                질문 지원과 개인화된 학습 경험을 제공할 수 있습니다.
              </p>
              <div className="flex items-center space-x-4">
                <Link href="/instructor/new">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    시험 출제하기
                  </Button>
                </Link>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>최근 업데이트: 오늘</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </SignedIn>
    </div>
  );
}
