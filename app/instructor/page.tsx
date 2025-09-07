"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignedIn, SignedOut, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  GraduationCap,
  BookOpen,
  Users,
  // BarChart3,
  Settings,
  Plus,
  FileText,
  Calendar,
  Eye,
  Edit,
  Copy,
  Clock,
} from "lucide-react";

interface Question {
  id: string;
  text: string;
  type: string;
  core_ability?: string;
}

interface Exam {
  id: string;
  title: string;
  code: string;
  description: string;
  duration: number;
  status: string;
  created_at: string;
  updated_at: string;
  questions: Question[];
}

export default function InstructorHome() {
  const router = useRouter();
  const { isSignedIn, isLoaded, user } = useUser();
  const [exams, setExams] = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get user role from metadata
  const userRole = (user?.unsafeMetadata?.role as string) || "student";

  // Redirect non-instructors or users without role
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      // Role이 설정되지 않은 경우 onboarding으로 리다이렉트
      if (!user?.unsafeMetadata?.role) {
        router.push("/onboarding");
        return;
      }
      // Role이 instructor가 아닌 경우 student 페이지로 리다이렉트
      if (userRole !== "instructor") {
        router.push("/student");
      }
    }
  }, [isLoaded, isSignedIn, userRole, user, router]);

  // Fetch exams when user is loaded
  useEffect(() => {
    if (isLoaded && isSignedIn && userRole === "instructor") {
      fetchExams();
    }
  }, [isLoaded, isSignedIn, userRole]);

  const fetchExams = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "get_instructor_exams",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setExams(data.exams || []);
      } else {
        console.error("Failed to fetch exams");
      }
    } catch (error) {
      console.error("Error fetching exams:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const copyExamCode = (code: string) => {
    navigator.clipboard.writeText(code);
    // You could add a toast notification here
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

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
                  <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200">
                    <Plus className="w-6 h-6 text-primary-foreground" />
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
                  <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200">
                    <FileText className="w-6 h-6 text-primary-foreground" />
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
                <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200">
                  <Users className="w-6 h-6 text-primary-foreground" />
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
                <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200">
                  <BarChart3 className="w-6 h-6 text-primary-foreground" />
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

          {/* 시험 관리 */}
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  <BookOpen className="w-5 h-5 text-primary" />
                  <span>시험 관리</span>
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>총 {exams.length}개의 시험</span>
                  </div>
                  <Link href="/instructor/exams">
                    <Button variant="outline" size="sm">
                      전체 보기
                    </Button>
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 새 시험 출제 버튼 */}
              <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border border-primary/20">
                <div>
                  <h3 className="font-semibold text-foreground mb-1">
                    새 시험 출제
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    AI 기반 인터랙티브 시험을 생성하고 학생들에게 배포하세요
                  </p>
                </div>
                <Link href="/instructor/new">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    시험 출제하기
                  </Button>
                </Link>
              </div>

              {/* 기존 시험 목록 */}
              <div>
                <h3 className="font-semibold text-foreground mb-4">
                  출제된 시험
                </h3>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                    <span className="ml-2 text-muted-foreground">
                      시험 목록을 불러오는 중...
                    </span>
                  </div>
                ) : exams.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-muted-foreground/20 rounded-lg">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">
                      아직 출제된 시험이 없습니다.
                    </p>
                    <Link href="/instructor/new">
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />첫 번째 시험 출제하기
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {exams.slice(0, 5).map((exam) => (
                      <div
                        key={exam.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h4 className="font-semibold text-foreground">
                              {exam.title}
                            </h4>
                            <Badge
                              variant={
                                exam.status === "published"
                                  ? "default"
                                  : "secondary"
                              }
                              className="text-xs"
                            >
                              {exam.status === "published"
                                ? "게시됨"
                                : "임시저장"}
                            </Badge>
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            <div className="flex items-center space-x-1">
                              <Copy className="w-3 h-3" />
                              <span className="font-mono">{exam.code}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Clock className="w-3 h-3" />
                              <span>{exam.duration}분</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Calendar className="w-3 h-3" />
                              <span>{formatDate(exam.created_at)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyExamCode(exam.code)}
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            복사
                          </Button>
                          <Link href={`/instructor/${exam.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="w-3 h-3 mr-1" />
                              보기
                            </Button>
                          </Link>
                          <Link href={`/instructor/${exam.id}`}>
                            <Button variant="outline" size="sm">
                              <Edit className="w-3 h-3 mr-1" />
                              편집
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                    {exams.length > 5 && (
                      <div className="text-center pt-4">
                        <Link href="/instructor/exams">
                          <Button variant="outline">
                            더 많은 시험 보기 ({exams.length - 5}개 더)
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
      </SignedIn>
    </div>
  );
}
