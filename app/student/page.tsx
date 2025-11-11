"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignedIn, SignedOut, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  User,
  Clock,
  Calendar,
  CheckCircle2,
  Circle,
  PlayCircle,
  FileText,
  Award,
  TrendingUp,
  Plus,
  Copy,
} from "lucide-react";
import { UserMenu } from "@/components/auth/UserMenu";

interface ExamSession {
  id: string;
  examId: string;
  examTitle: string;
  examCode: string;
  duration: number;
  status: "completed" | "in-progress";
  submittedAt: string | null;
  createdAt: string;
  submissionCount: number;
  score: number | null;
  maxScore: number | null;
  averageScore: number | null;
  isGraded: boolean;
}

export default function StudentDashboard() {
  const router = useRouter();
  const { isSignedIn, isLoaded, user } = useUser();
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get user role from metadata
  const userRole = (user?.unsafeMetadata?.role as string) || "student";

  // Redirect non-students or users without role
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      // Role이 설정되지 않은 경우 onboarding으로 리다이렉트
      if (!user?.unsafeMetadata?.role) {
        router.push("/onboarding");
        return;
      }
      // Role이 student가 아닌 경우 instructor 페이지로 리다이렉트
      if (userRole !== "student") {
        router.push("/instructor");
      }
    }
  }, [isLoaded, isSignedIn, userRole, user, router]);

  // Fetch sessions when user is loaded
  useEffect(() => {
    if (isLoaded && isSignedIn && userRole === "student") {
      fetchSessions();
    }
  }, [isLoaded, isSignedIn, userRole]);

  const fetchSessions = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/student/sessions");

      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      } else {
        console.error("Failed to fetch sessions");
      }
    } catch (error) {
      console.error("Error fetching sessions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
      case "in-progress":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4" />;
      case "in-progress":
        return <Circle className="w-4 h-4" />;
      default:
        return <Circle className="w-4 h-4" />;
    }
  };

  const getScoreColor = (score: number | null, maxScore: number | null) => {
    if (score === null || maxScore === null) return "text-muted-foreground";
    const percentage = (score / maxScore) * 100;
    if (percentage >= 90) return "text-green-600 dark:text-green-400";
    if (percentage >= 80) return "text-blue-600 dark:text-blue-400";
    if (percentage >= 70) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "날짜 없음";
    return new Date(dateString).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const completedSessions = sessions.filter(
    (session) => session.status === "completed"
  );
  const inProgressSessions = sessions.filter(
    (session) => session.status === "in-progress"
  );

  // Calculate average score using averageScore from sessions (which is already percentage)
  const scoredSessions = completedSessions.filter(
    (s) => s.averageScore !== null
  );
  const overallAverageScore =
    scoredSessions.length > 0
      ? Math.round(
          scoredSessions.reduce(
            (sum, session) => sum + (session.averageScore || 0),
            0
          ) / scoredSessions.length
        )
      : null;

  return (
    <div className="min-h-screen bg-background">
      <SignedOut>
        <div className="flex items-center justify-center h-screen">
          <Card className="w-full max-w-md shadow-xl border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="text-center space-y-4">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
                <User className="w-8 h-8 text-primary-foreground" />
              </div>
              <CardTitle className="text-xl">로그인이 필요합니다</CardTitle>
              <p className="text-sm text-muted-foreground">
                학생 페이지에 접근하려면 로그인해주세요
              </p>
            </CardHeader>
            <CardContent className="text-center pb-8">
              <Button
                onClick={() => router.replace("/sign-in")}
                className="w-full"
              >
                학생으로 로그인
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
                  <User className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">
                    학생 대시보드
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    환영합니다,{" "}
                    {user?.firstName || user?.emailAddresses[0]?.emailAddress}님
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Badge
                  variant="outline"
                  className="bg-primary/10 text-primary border-primary/20"
                >
                  학생 모드
                </Badge>
                <UserMenu />
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
                  <h2 className="text-2xl font-bold">안녕하세요, 학생님!</h2>
                  <p className="text-primary-foreground/80">
                    시험 코드를 입력하여 시험을 시작하거나, 완료한 시험의 결과를
                    확인하세요
                  </p>
                </div>
                <div className="hidden md:block">
                  <BookOpen className="w-16 h-16 text-primary-foreground/60" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Link href="/join">
              <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer group">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200">
                    <Plus className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">
                    새 시험 시작
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    시험 코드를 입력하여 시험에 참여하기
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer group">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200">
                  <FileText className="w-6 h-6 text-primary-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">
                  시험 기록
                </h3>
                <p className="text-sm text-muted-foreground">
                  완료한 시험 및 진행 중인 시험 확인
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Stats Overview */}
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="border-0 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">전체 시험</CardTitle>
                <FileText className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{sessions.length}</div>
                <p className="text-xs text-muted-foreground">
                  {completedSessions.length}개 완료, {inProgressSessions.length}
                  개 진행 중
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">평균 점수</CardTitle>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    overallAverageScore !== null
                      ? getScoreColor(overallAverageScore, 100)
                      : "text-muted-foreground"
                  }`}
                >
                  {overallAverageScore !== null
                    ? `${overallAverageScore}%`
                    : "평가 대기"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {scoredSessions.length}개 시험 기준
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  완료한 시험
                </CardTitle>
                <Award className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {completedSessions.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {inProgressSessions.length > 0
                    ? `${inProgressSessions.length}개 진행 중`
                    : "모든 시험 완료"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Exam History */}
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center space-x-2">
                    <BookOpen className="w-5 h-5 text-primary" />
                    <span>시험 기록</span>
                  </CardTitle>
                  <CardDescription className="mt-2">
                    시험에서의 성과 및 진행 상황
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>총 {sessions.length}개의 시험</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                  <span className="ml-2 text-muted-foreground">
                    시험 목록을 불러오는 중...
                  </span>
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-muted-foreground/20 rounded-lg">
                  <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">
                    아직 치른 시험이 없습니다.
                  </p>
                  <Link href="/join">
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />첫 번째 시험 시작하기
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h4 className="font-semibold text-foreground">
                            {session.examTitle}
                          </h4>
                          <Badge
                            variant="outline"
                            className={`flex items-center space-x-1 ${getStatusColor(
                              session.status
                            )}`}
                          >
                            {getStatusIcon(session.status)}
                            <span>
                              {session.status === "completed"
                                ? "완료"
                                : "진행 중"}
                            </span>
                          </Badge>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                          <div className="flex items-center space-x-1">
                            <Copy className="w-3 h-3" />
                            <span className="font-mono">
                              {session.examCode}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{session.duration}분</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-3 h-3" />
                            <span>
                              {session.submittedAt
                                ? formatDate(session.submittedAt)
                                : formatDate(session.createdAt)}
                            </span>
                          </div>
                          {session.submissionCount > 0 && (
                            <span>{session.submissionCount}개 문제 제출됨</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {session.status === "completed" &&
                          session.isGraded &&
                          session.averageScore !== null && (
                            <div className="text-right">
                              <div
                                className={`text-lg font-bold ${getScoreColor(
                                  session.averageScore,
                                  100
                                )}`}
                              >
                                {session.averageScore}%
                              </div>
                              {session.score !== null &&
                                session.maxScore !== null && (
                                  <div className="text-xs text-muted-foreground">
                                    {session.score}/{session.maxScore}점
                                  </div>
                                )}
                            </div>
                          )}
                        {session.status === "in-progress" && (
                          <Link href={`/exam/${session.examCode}`}>
                            <Button size="sm">
                              <PlayCircle className="w-3 h-3 mr-1" />
                              계속하기
                            </Button>
                          </Link>
                        )}
                        {session.status === "completed" && (
                          <>
                            {session.isGraded ? (
                              <Link href={`/student/report/${session.id}`}>
                                <Button variant="outline" size="sm">
                                  <FileText className="w-3 h-3 mr-1" />
                                  리포트 보기
                                </Button>
                              </Link>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20"
                              >
                                평가 대기중
                              </Badge>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </SignedIn>
    </div>
  );
}
