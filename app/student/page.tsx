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
import { Input } from "@/components/ui/input";
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
  Search,
  X,
  ListFilterIcon,
  Loader2,
} from "lucide-react";
import { UserMenu } from "@/components/auth/UserMenu";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";

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

interface SessionsResponse {
  sessions: ExamSession[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

export default function StudentDashboard() {
  const router = useRouter();
  const { isSignedIn, isLoaded, user } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<
    "all" | "graded" | "pending" | "in-progress"
  >("all");

  // Intersection Observer hook
  const { ref: observerRef, inView } = useInView();

  // Get user role from metadata
  const userRole = (user?.unsafeMetadata?.role as string) || "student";
  const [profileChecked, setProfileChecked] = useState(false);
  const [isCheckingProfile, setIsCheckingProfile] = useState(false);

  // Scroll to top on mount and when pathname changes
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, []);

  // Redirect non-students or users without role
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      if (!user?.unsafeMetadata?.role) {
        router.push("/onboarding");
        return;
      }
      if (userRole !== "student") {
        router.push("/instructor");
        return;
      }
    }
  }, [isLoaded, isSignedIn, userRole, user, router]);

  // Check if profile exists for students
  useEffect(() => {
    const checkProfile = async () => {
      if (profileChecked || isCheckingProfile) return;
      if (isLoaded && isSignedIn && userRole === "student") {
        setIsCheckingProfile(true);
        try {
          const response = await fetch("/api/student/profile");
          if (response.ok) {
            const data = await response.json();
            if (!data.profile) {
              router.replace("/student/profile-setup");
              return;
            }
          } else if (response.status === 403) {
            router.replace("/instructor");
            return;
          }
        } catch (error) {
          console.error("[Profile Check] Error checking profile:", error);
        } finally {
          setProfileChecked(true);
          setIsCheckingProfile(false);
        }
      }
    };
    checkProfile();
  }, [
    isLoaded,
    isSignedIn,
    userRole,
    profileChecked,
    isCheckingProfile,
    router,
    user,
  ]);

  // TanStack Query for Sessions (Infinite Scroll)
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isSessionsLoading,
  } = useInfiniteQuery({
    queryKey: ["student-sessions", user?.id],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await fetch(
        `/api/student/sessions?page=${pageParam}&limit=10`
      );
      if (!response.ok) throw new Error("Failed to fetch sessions");
      return response.json() as Promise<SessionsResponse>;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    enabled: !!(
      isLoaded &&
      isSignedIn &&
      userRole === "student" &&
      profileChecked
    ),
    staleTime: 1000 * 60 * 1, // 1 minute stale time
  });

  // Load more when in view
  useEffect(() => {
    if (
      inView &&
      hasNextPage &&
      !isFetchingNextPage &&
      !searchQuery &&
      filter === "all"
    ) {
      fetchNextPage();
    }
  }, [
    inView,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    searchQuery,
    filter,
  ]);

  // TanStack Query for Stats
  const { data: overallStats } = useQuery({
    queryKey: ["student-stats", user?.id],
    queryFn: async () => {
      const response = await fetch("/api/student/sessions/stats");
      if (!response.ok) throw new Error("Failed to fetch stats");
      return response.json();
    },
    enabled: !!(
      isLoaded &&
      isSignedIn &&
      userRole === "student" &&
      profileChecked
    ),
    staleTime: 1000 * 60 * 5, // 5 minutes stale time
  });

  // Flatten sessions from pages
  const allSessions = data?.pages.flatMap((page) => page.sessions) || [];

  const completedSessions = allSessions.filter(
    (session) => session.status === "completed"
  );
  const inProgressSessions = allSessions.filter(
    (session) => session.status === "in-progress"
  );

  // Filter sessions based on search query and filter
  const filteredSessions = allSessions.filter((session) => {
    // Apply filter
    if (filter === "graded") {
      if (session.status !== "completed" || !session.isGraded) return false;
    } else if (filter === "pending") {
      if (session.status !== "completed" || session.isGraded) return false;
    } else if (filter === "in-progress") {
      if (session.status !== "in-progress") return false;
    }

    // Apply search query
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      session.examTitle.toLowerCase().includes(query) ||
      session.examCode.toLowerCase().includes(query)
    );
  });

  const displayTotalCount = overallStats?.totalSessions || allSessions.length;
  const displayCompletedCount =
    overallStats?.completedSessions || completedSessions.length;
  const displayInProgressCount =
    overallStats?.inProgressSessions || inProgressSessions.length;
  const overallAverageScore = overallStats?.overallAverageScore ?? null;

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

  // Skeleton loading components
  const StatCardSkeleton = () => (
    <Card className="border-0 shadow-lg animate-pulse">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="h-4 w-20 bg-muted rounded" />
        <div className="h-4 w-4 bg-muted rounded" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-16 bg-muted rounded mb-2" />
        <div className="h-3 w-32 bg-muted rounded" />
      </CardContent>
    </Card>
  );

  const SessionCardSkeleton = () => (
    <div className="flex items-center justify-between p-4 border rounded-lg animate-pulse">
      <div className="flex-1 space-y-3">
        <div className="flex items-center space-x-3">
          <div className="h-5 w-48 bg-muted rounded" />
          <div className="h-5 w-16 bg-muted rounded-full" />
        </div>
        <div className="flex items-center space-x-4">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
      </div>
      <div className="h-9 w-24 bg-muted rounded" />
    </div>
  );

  if (isLoaded && isSignedIn && userRole === "student" && isCheckingProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">프로필 확인 중...</p>
      </div>
    );
  }

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
        <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-md border-b border-border shadow-sm transition-all duration-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shrink-0">
                  <User
                    className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground"
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">
                    학생 대시보드
                  </h1>
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">
                    환영합니다,{" "}
                    {user?.firstName || user?.emailAddresses[0]?.emailAddress}님
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
                <Badge
                  variant="outline"
                  className="bg-primary/10 text-primary border-primary/20 text-xs sm:text-sm"
                  aria-label="학생 모드"
                >
                  학생 모드
                </Badge>
                <UserMenu />
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
          <Card className="border-0 shadow-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground overflow-hidden">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  <h2 className="text-xl sm:text-2xl font-bold">
                    안녕하세요, 학생님!
                  </h2>
                  <p className="text-sm sm:text-base text-primary-foreground/90 leading-relaxed">
                    시험 코드를 입력하여 시험을 시작하거나, 완료한 시험의 결과를
                    확인하세요
                  </p>
                </div>
                <div className="hidden md:block shrink-0">
                  <BookOpen
                    className="w-16 h-16 text-primary-foreground/60"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <Link
              href="/join"
              className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg"
            >
              <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer group h-full focus-within:ring-2 focus-within:ring-primary">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200">
                    <Plus
                      className="w-6 h-6 text-primary-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2 text-base sm:text-lg">
                    새 시험 시작
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    시험 코드를 입력하여 시험에 참여하기
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Card
              className="border-0 shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer group h-full focus-within:ring-2 focus-within:ring-primary"
              onClick={() => {
                document.getElementById("exam-history")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  document.getElementById("exam-history")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }
              }}
              tabIndex={0}
              role="button"
              aria-label="시험 기록으로 이동"
            >
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200">
                  <FileText
                    className="w-6 h-6 text-primary-foreground"
                    aria-hidden="true"
                  />
                </div>
                <h3 className="font-semibold text-foreground mb-2 text-base sm:text-lg">
                  시험 기록
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  완료한 시험 및 진행 중인 시험 확인
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {isSessionsLoading && !overallStats ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              <>
                <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-200">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      전체 시험
                    </CardTitle>
                    <FileText
                      className="w-4 h-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl sm:text-3xl font-bold">
                      {displayTotalCount}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {displayCompletedCount}개 완료, {displayInProgressCount}개
                      진행 중
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-200">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      평균 점수
                    </CardTitle>
                    <TrendingUp
                      className="w-4 h-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`text-2xl sm:text-3xl font-bold transition-colors duration-200 ${
                        overallAverageScore !== null
                          ? getScoreColor(overallAverageScore, 100)
                          : "text-muted-foreground"
                      }`}
                    >
                      {overallAverageScore !== null
                        ? `${overallAverageScore}%`
                        : "평가 대기"}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {overallStats?.completedSessions || displayCompletedCount}
                      개 시험 기준
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-200 sm:col-span-2 lg:col-span-1">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      완료한 시험
                    </CardTitle>
                    <Award
                      className="w-4 h-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl sm:text-3xl font-bold">
                      {displayCompletedCount}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {displayInProgressCount > 0
                        ? `${displayInProgressCount}개 진행 중`
                        : "모든 시험 완료"}
                    </p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          <Card id="exam-history" className="border-0 shadow-xl">
            <CardHeader className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <CardTitle className="flex items-center space-x-2 text-lg sm:text-xl">
                    <BookOpen
                      className="w-5 h-5 text-primary shrink-0"
                      aria-hidden="true"
                    />
                    <span>시험 기록</span>
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm">
                    시험에서의 성과 및 진행 상황
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2 text-xs sm:text-sm text-muted-foreground shrink-0">
                  <Calendar className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">
                    {searchQuery.trim() || filter !== "all"
                      ? `${filteredSessions.length}개 표시됨 / 총 ${displayTotalCount}개`
                      : `총 ${displayTotalCount}개의 시험`}
                  </span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 -mx-1 px-1 hide-scrollbar">
                  <ListFilterIcon
                    className="w-4 h-4 text-muted-foreground shrink-0"
                    aria-hidden="true"
                  />
                  <Button
                    variant={filter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter("all")}
                    className="shrink-0 min-h-[44px] px-4"
                    aria-pressed={filter === "all"}
                    aria-label="전체 필터"
                  >
                    전체
                  </Button>
                  <Button
                    variant={filter === "graded" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter("graded")}
                    className="shrink-0 min-h-[44px] px-4"
                    aria-pressed={filter === "graded"}
                    aria-label="평가 완료 필터"
                  >
                    평가 완료
                  </Button>
                  <Button
                    variant={filter === "pending" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter("pending")}
                    className="shrink-0 min-h-[44px] px-4"
                    aria-pressed={filter === "pending"}
                    aria-label="평가 대기중 필터"
                  >
                    평가 대기중
                  </Button>
                  <Button
                    variant={filter === "in-progress" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter("in-progress")}
                    className="shrink-0 min-h-[44px] px-4"
                    aria-pressed={filter === "in-progress"}
                    aria-label="진행 중 필터"
                  >
                    진행 중
                  </Button>
                </div>
                <div className="relative flex-1 sm:max-w-md">
                  <Search
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                    aria-hidden="true"
                  />
                  <Input
                    type="text"
                    placeholder="시험 제목 또는 코드로 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-9 min-h-[44px]"
                    aria-label="시험 검색"
                  />
                  {(searchQuery || filter !== "all") && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setFilter("all");
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary min-w-[44px] min-h-[44px] flex items-center justify-center"
                      title="필터 및 검색 초기화"
                      aria-label="필터 및 검색 초기화"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6">
              {isSessionsLoading && allSessions.length === 0 ? (
                <div className="space-y-3">
                  <SessionCardSkeleton />
                  <SessionCardSkeleton />
                  <SessionCardSkeleton />
                </div>
              ) : allSessions.length === 0 ? (
                <div className="text-center py-12 sm:py-16 border-2 border-dashed border-muted-foreground/20 rounded-lg bg-muted/30">
                  <BookOpen
                    className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground mx-auto mb-4"
                    aria-hidden="true"
                  />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    아직 치른 시험이 없습니다
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                    첫 번째 시험을 시작하여 학습 성과를 추적해보세요.
                  </p>
                  <Link href="/join">
                    <Button size="lg" className="min-h-[44px]">
                      <Plus className="w-4 h-4 mr-2" aria-hidden="true" />첫
                      번째 시험 시작하기
                    </Button>
                  </Link>
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="text-center py-12 sm:py-16 border-2 border-dashed border-muted-foreground/20 rounded-lg bg-muted/30">
                  <Search
                    className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground mx-auto mb-4"
                    aria-hidden="true"
                  />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    검색 결과가 없습니다
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                    다른 검색어나 필터를 시도해보세요.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setFilter("all");
                    }}
                    className="min-h-[44px]"
                  >
                    <X className="w-4 h-4 mr-2" aria-hidden="true" />
                    검색 초기화
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-5 border rounded-lg hover:bg-muted/50 transition-colors duration-200 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2"
                    >
                      <div className="flex-1 min-w-0 w-full sm:w-auto">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
                          <h4 className="font-semibold text-foreground text-base sm:text-lg break-words">
                            {session.examTitle}
                          </h4>
                          <Badge
                            variant="outline"
                            className={`flex items-center space-x-1 shrink-0 ${getStatusColor(
                              session.status
                            )}`}
                            aria-label={`상태: ${
                              session.status === "completed"
                                ? "완료"
                                : "진행 중"
                            }`}
                          >
                            {getStatusIcon(session.status)}
                            <span>
                              {session.status === "completed"
                                ? "완료"
                                : "진행 중"}
                            </span>
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                          <div className="flex items-center space-x-1.5">
                            <Copy
                              className="w-3.5 h-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="exam-code font-mono break-all">
                              {session.examCode}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <Clock
                              className="w-3.5 h-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            <span>{session.duration}분</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <Calendar
                              className="w-3.5 h-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="whitespace-nowrap">
                              {session.submittedAt
                                ? formatDate(session.submittedAt)
                                : formatDate(session.createdAt)}
                            </span>
                          </div>
                          {session.submissionCount > 0 && (
                            <span className="whitespace-nowrap">
                              {session.submissionCount}개 문제 제출됨
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 sm:gap-4 shrink-0 w-full sm:w-auto justify-end sm:justify-start">
                        {session.status === "completed" &&
                          session.isGraded &&
                          session.averageScore !== null && (
                            <div className="text-right sm:text-left">
                              <div
                                className={`text-lg sm:text-xl font-bold transition-colors duration-200 ${getScoreColor(
                                  session.averageScore,
                                  100
                                )}`}
                                aria-label={`평균 점수: ${session.averageScore}%`}
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
                          <Link
                            href={`/exam/${session.examCode}`}
                            className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md"
                          >
                            <Button size="sm" className="min-h-[44px] px-4">
                              <PlayCircle
                                className="w-4 h-4 mr-1.5"
                                aria-hidden="true"
                              />
                              계속하기
                            </Button>
                          </Link>
                        )}
                        {session.status === "completed" && (
                          <>
                            {session.isGraded ? (
                              <Link
                                href={`/student/report/${session.id}`}
                                className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md"
                              >
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="min-h-[44px] px-4"
                                >
                                  <FileText
                                    className="w-4 h-4 mr-1.5"
                                    aria-hidden="true"
                                  />
                                  리포트 보기
                                </Button>
                              </Link>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20 px-3 py-1.5"
                                aria-label="평가 대기중"
                              >
                                평가 대기중
                              </Badge>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {!searchQuery.trim() && filter === "all" && hasNextPage && (
                    <div
                      ref={observerRef}
                      className="flex flex-col items-center justify-center py-6 gap-2"
                      aria-live="polite"
                    >
                      {isFetchingNextPage ? (
                        <>
                          <Loader2
                            className="w-6 h-6 animate-spin text-primary"
                            aria-hidden="true"
                          />
                          <span className="text-sm text-muted-foreground">
                            더 불러오는 중...
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          스크롤해서 더 보기
                        </span>
                      )}
                    </div>
                  )}
                  {!hasNextPage &&
                    !searchQuery.trim() &&
                    filter === "all" &&
                    allSessions.length > 0 && (
                      <div className="text-center py-6 text-sm text-muted-foreground border-t pt-6">
                        모든 시험을 불러왔습니다.
                      </div>
                    )}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </SignedIn>
    </div>
  );
}
