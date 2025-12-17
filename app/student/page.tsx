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
  Menu,
  LayoutDashboard,
  History,
} from "lucide-react";
import { UserMenu } from "@/components/auth/UserMenu";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { useInView } from "react-intersection-observer";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

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
  const pathname = usePathname();
  const { isSignedIn, isLoaded, user } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<
    "all" | "graded" | "pending" | "in-progress"
  >("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    queryKey: qk.student.sessions(user?.id),
    queryFn: async ({ pageParam = 1, signal }) => {
      const response = await fetch(
        `/api/student/sessions?page=${pageParam}&limit=10`,
        { signal } // AbortSignal 연결
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
    queryKey: qk.student.stats(user?.id),
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/student/sessions/stats", {
        signal, // AbortSignal 연결
      });
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

  // 완료율 계산
  const completionRate =
    displayTotalCount > 0
      ? Math.round((displayCompletedCount / displayTotalCount) * 100)
      : 0;

  // 이번 달 시험 수 계산
  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);
  const thisMonthSessions = allSessions.filter(
    (session) => new Date(session.createdAt) >= currentMonth
  ).length;

  // Prepare chart data
  // 최근 6개월 또는 최근 시험들의 추이 데이터 생성
  const prepareTotalExamsChartData = () => {
    if (allSessions.length === 0) return [];

    // 최근 6개 시험을 기준으로 누적 데이터 생성
    const recentSessions = [...allSessions]
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
      .slice(0, 6);

    let cumulative = 0;
    return recentSessions.map((session, index) => {
      cumulative += 1;
      return {
        name: `${index + 1}`,
        value: cumulative,
      };
    });
  };

  const prepareAverageScoreChartData = () => {
    if (completedSessions.length === 0) return [];

    // 완료된 시험 중 점수가 있는 것들만 필터링
    const scoredSessions = completedSessions
      .filter((s) => s.averageScore !== null)
      .sort(
        (a, b) =>
          new Date(b.submittedAt || b.createdAt).getTime() -
          new Date(a.submittedAt || a.createdAt).getTime()
      )
      .slice(0, 6)
      .reverse();

    return scoredSessions.map((session, index) => ({
      name: `시험 ${index + 1}`,
      score: session.averageScore || 0,
    }));
  };

  const prepareCompletionChartData = () => {
    const completed = displayCompletedCount;
    const inProgress = displayInProgressCount;
    const total = displayTotalCount;

    if (total === 0) return [];

    return [
      { name: "완료", value: completed, fill: "hsl(var(--primary))" },
      { name: "진행중", value: inProgress, fill: "hsl(217 75% 65%)" },
    ];
  };

  const totalExamsChartData = prepareTotalExamsChartData();
  const averageScoreChartData = prepareAverageScoreChartData();
  const completionChartData = prepareCompletionChartData();

  const totalExamsChartConfig = {
    value: {
      label: "시험",
      color: "hsl(var(--primary))",
    },
  } satisfies ChartConfig;

  const averageScoreChartConfig = {
    score: {
      label: "점수",
      color: "hsl(217 85% 55%)",
    },
  } satisfies ChartConfig;

  const completionChartConfig = {
    completed: {
      label: "완료",
      color: "hsl(var(--primary))",
    },
    inProgress: {
      label: "진행중",
      color: "hsl(217 75% 65%)",
    },
  } satisfies ChartConfig;

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

  const navigationItems = [
    {
      title: "대시보드",
      href: "/student",
      icon: LayoutDashboard,
      active: pathname === "/student",
    },
    {
      title: "새 시험 시작",
      href: "/join",
      icon: Plus,
      active: pathname === "/join",
    },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Sidebar Header */}
      <div className="p-4 sm:p-5 border-b border-sidebar-border">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shrink-0 shadow-sm">
            <User
              className="w-5 h-5 text-primary-foreground"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-sidebar-foreground truncate">
              학생 대시보드
            </h2>
            <p className="text-xs text-sidebar-foreground/70 truncate">
              {user?.firstName || user?.emailAddresses[0]?.emailAddress}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="bg-primary/10 text-primary border-primary/20 text-xs w-fit"
        >
          학생 모드
        </Badge>
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 p-3 sm:p-4 space-y-1 overflow-y-auto"
        aria-label="주요 네비게이션"
      >
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-sidebar",
                item.active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              aria-current={item.active ? "page" : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <UserMenu />
      </div>
    </div>
  );

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
        <div className="flex h-screen overflow-hidden">
          {/* Desktop Sidebar */}
          <aside
            className="hidden lg:flex lg:flex-shrink-0 lg:w-64 lg:flex-col lg:border-r lg:border-sidebar-border"
            aria-label="사이드바 네비게이션"
          >
            <SidebarContent />
          </aside>

          {/* Mobile Sidebar Sheet */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>메뉴</SheetTitle>
              </SheetHeader>
              <SidebarContent />
            </SheetContent>
          </Sheet>

          {/* Main Content Area */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            {/* Top Header */}
            <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border shadow-sm transition-all duration-200">
              <div className="px-4 sm:px-6 lg:px-8 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                    {/* Mobile Menu Button */}
                    <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                      <SheetTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="lg:hidden min-h-[44px] min-w-[44px] p-0"
                          aria-label="메뉴 열기"
                        >
                          <Menu className="w-5 h-5" aria-hidden="true" />
                        </Button>
                      </SheetTrigger>
                    </Sheet>

                    <div className="min-w-0">
                      <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">
                        학생 대시보드
                      </h1>
                      <p className="text-xs text-muted-foreground truncate hidden sm:block">
                        환영합니다,{" "}
                        {user?.firstName ||
                          user?.emailAddresses[0]?.emailAddress}
                        님
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <Badge
                      variant="outline"
                      className="bg-primary/10 text-primary border-primary/20 text-xs hidden sm:inline-flex"
                      aria-label="학생 모드"
                    >
                      학생 모드
                    </Badge>
                    <div className="lg:hidden">
                      <UserMenu />
                    </div>
                  </div>
                </div>
              </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto bg-background">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
                {/* Welcome Section */}
                <Card className="border-0 shadow-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground overflow-hidden">
                  <CardContent className="p-6 sm:p-8">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-2 flex-1 min-w-0">
                        <h2 className="text-xl sm:text-2xl font-bold">
                          안녕하세요, 학생님!
                        </h2>
                        <p className="text-sm sm:text-base text-primary-foreground/90 leading-relaxed">
                          시험 코드를 입력하여 시험을 시작하거나, 완료한 시험의
                          결과를 확인하세요
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

                {/* Statistics Cards */}
                <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {isSessionsLoading && !overallStats ? (
                    <>
                      <StatCardSkeleton />
                      <StatCardSkeleton />
                      <StatCardSkeleton />
                    </>
                  ) : (
                    <>
                      {/* 전체 시험 카드 */}
                      <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-200 relative overflow-hidden">
                        <div className="absolute inset-0 opacity-[0.18] pointer-events-none">
                          {totalExamsChartData.length > 0 ? (
                            <ChartContainer
                              config={totalExamsChartConfig}
                              className="h-full w-full"
                            >
                              <AreaChart
                                data={totalExamsChartData}
                                margin={{
                                  top: 0,
                                  right: 0,
                                  bottom: 0,
                                  left: 0,
                                }}
                              >
                                <defs>
                                  <linearGradient
                                    id="totalExamsGradient"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                  >
                                    <stop
                                      offset="0%"
                                      stopColor="hsl(217 91% 60%)"
                                      stopOpacity={0.7}
                                    />
                                    <stop
                                      offset="50%"
                                      stopColor="hsl(217 85% 65%)"
                                      stopOpacity={0.4}
                                    />
                                    <stop
                                      offset="100%"
                                      stopColor="hsl(217 75% 70%)"
                                      stopOpacity={0}
                                    />
                                  </linearGradient>
                                </defs>
                                <Area
                                  type="monotone"
                                  dataKey="value"
                                  stroke="hsl(217 91% 60%)"
                                  fill="url(#totalExamsGradient)"
                                  strokeWidth={2.5}
                                />
                              </AreaChart>
                            </ChartContainer>
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <div className="h-16 w-16 border-2 border-dashed border-primary/30 rounded-full" />
                            </div>
                          )}
                        </div>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                          <CardTitle className="text-sm font-medium">
                            전체 시험
                          </CardTitle>
                          <FileText
                            className="w-4 h-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </CardHeader>
                        <CardContent className="relative z-10">
                          <div className="text-2xl sm:text-3xl font-bold">
                            {displayTotalCount}
                          </div>
                          <div className="flex items-baseline gap-2 mt-2">
                            <div className="flex items-center gap-1">
                              <div className="h-2 w-2 rounded-full bg-primary" />
                              <span className="text-xs font-medium text-foreground">
                                완료율 {completionRate}%
                              </span>
                            </div>
                            {thisMonthSessions > 0 && (
                              <span className="text-xs text-muted-foreground">
                                · 이번 달 {thisMonthSessions}개
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {displayCompletedCount}개 완료,{" "}
                            {displayInProgressCount}개 진행 중
                          </p>
                        </CardContent>
                      </Card>

                      {/* 평균 점수 카드 */}
                      <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-200 relative overflow-hidden">
                        <div className="absolute inset-0 opacity-[0.15] pointer-events-none">
                          {averageScoreChartData.length > 0 ? (
                            <ChartContainer
                              config={averageScoreChartConfig}
                              className="h-full w-full"
                            >
                              <AreaChart
                                data={averageScoreChartData}
                                margin={{
                                  top: 0,
                                  right: 0,
                                  bottom: 0,
                                  left: 0,
                                }}
                              >
                                <defs>
                                  <linearGradient
                                    id="averageScoreGradient"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                  >
                                    <stop
                                      offset="0%"
                                      stopColor="hsl(217 85% 55%)"
                                      stopOpacity={0.6}
                                    />
                                    <stop
                                      offset="100%"
                                      stopColor="hsl(217 85% 55%)"
                                      stopOpacity={0}
                                    />
                                  </linearGradient>
                                </defs>
                                <Area
                                  type="monotone"
                                  dataKey="score"
                                  stroke="hsl(217 85% 55%)"
                                  fill="url(#averageScoreGradient)"
                                  strokeWidth={2}
                                />
                              </AreaChart>
                            </ChartContainer>
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <div className="h-16 w-16 border-2 border-dashed border-primary/20 rounded-full" />
                            </div>
                          )}
                        </div>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                          <CardTitle className="text-sm font-medium">
                            평균 점수
                          </CardTitle>
                          <TrendingUp
                            className="w-4 h-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </CardHeader>
                        <CardContent className="relative z-10">
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
                            {overallStats?.completedSessions ||
                              displayCompletedCount}
                            개 시험 기준
                          </p>
                        </CardContent>
                      </Card>

                      {/* 완료한 시험 카드 */}
                      <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-200 sm:col-span-2 lg:col-span-1 relative overflow-hidden">
                        <div className="absolute inset-0 opacity-[0.15] pointer-events-none flex items-center justify-center">
                          {completionChartData.length > 0 ? (
                            <ChartContainer
                              config={completionChartConfig}
                              className="h-24 w-24"
                            >
                              <PieChart>
                                <Pie
                                  data={completionChartData}
                                  dataKey="value"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={28}
                                  outerRadius={38}
                                  startAngle={90}
                                  endAngle={-270}
                                >
                                  {completionChartData.map((entry, index) => (
                                    <Cell
                                      key={`cell-${index}`}
                                      fill={entry.fill}
                                    />
                                  ))}
                                </Pie>
                              </PieChart>
                            </ChartContainer>
                          ) : (
                            <div className="h-24 w-24 border-2 border-dashed border-primary/20 rounded-full" />
                          )}
                        </div>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                          <CardTitle className="text-sm font-medium">
                            완료한 시험
                          </CardTitle>
                          <Award
                            className="w-4 h-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </CardHeader>
                        <CardContent className="relative z-10">
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

                {/* Exam History Section */}
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
                        <Calendar
                          className="w-4 h-4 shrink-0"
                          aria-hidden="true"
                        />
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
                          variant={
                            filter === "in-progress" ? "default" : "outline"
                          }
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
                            <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                            첫 번째 시험 시작하기
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
                                  <Button
                                    size="sm"
                                    className="min-h-[44px] px-4"
                                  >
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
                        {!searchQuery.trim() &&
                          filter === "all" &&
                          hasNextPage && (
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
              </div>
            </main>
          </div>
        </div>
      </SignedIn>
    </div>
  );
}
