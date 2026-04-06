"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  Clock,
  RefreshCw,
  Search,
  Settings,
  Shield,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorAlert } from "@/components/ui/error-alert";
import { AdminShell } from "@/components/admin/AdminShell";
import { qk } from "@/lib/query-keys";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt: string;
  lastSignInAt: string;
  imageUrl: string;
}

interface UserStats {
  total: number;
  instructors: number;
  students: number;
  noRole: number;
}

interface AiSummaryResponse {
  totals: {
    requests: number;
    failedRequests: number;
    estimatedCostUsdMicros: number;
  };
}

type AdminUsersResponse =
  | { unauthorized: true }
  | {
      unauthorized: false;
      users: User[];
      stats: UserStats;
    };

function formatUsdMicros(value: number | undefined): string {
  const usd = (value ?? 0) / 1_000_000;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(usd);
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default function AdminDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [mutationError, setMutationError] = useState("");
  const router = useRouter();

  const {
    data: usersResponse,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery<AdminUsersResponse>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const response = await fetch("/api/admin/users");

      if (response.status === 401 || response.status === 403) {
        return { unauthorized: true } as const;
      }

      if (!response.ok) {
        throw new Error("사용자 정보를 불러오는데 실패했습니다.");
      }

      const data = await response.json();
      return { unauthorized: false, ...data } as const;
    },
    retry: false,
  });

  const {
    data: aiSummary,
    isLoading: isAiSummaryLoading,
    refetch: refetchAiSummary,
  } = useQuery<AiSummaryResponse | null>({
    queryKey: qk.admin.aiUsageSummary({ range: "7d" }),
    queryFn: async () => {
      const response = await fetch("/api/admin/ai-usage/summary?range=7d");

      if (response.status === 401 || response.status === 403) {
        return null;
      }

      if (!response.ok) {
        throw new Error("AI 사용량 정보를 불러오는데 실패했습니다.");
      }

      return response.json();
    },
    retry: false,
  });

  const { data: pendingInstructors, refetch: refetchPending } = useQuery({
    queryKey: ["admin-pending-instructors"],
    queryFn: async () => {
      const res = await fetch("/api/admin/instructors/pending");
      if (!res.ok) return [];
      const data = await res.json();
      return data.instructors || [];
    },
  });

  useEffect(() => {
    if (usersResponse?.unauthorized) {
      router.push("/admin/login");
    }
  }, [usersResponse, router]);

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        await refetch();
      } else {
        setMutationError("역할 변경에 실패했습니다.");
      }
    } catch {
      setMutationError("서버 오류가 발생했습니다.");
    }
  };

  const approveInstructor = async (instructorId: string) => {
    const res = await fetch("/api/admin/instructors/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructorId }),
    });
    if (res.ok) {
      refetchPending();
      refetch();
    }
  };

  const users = usersResponse && !usersResponse.unauthorized ? usersResponse.users : [];
  const stats: UserStats =
    usersResponse && !usersResponse.unauthorized
      ? usersResponse.stats
      : {
          total: 0,
          instructors: 0,
          students: 0,
          noRole: 0,
        };
  const error =
    mutationError ||
    (queryError instanceof Error
      ? queryError.message
      : queryError
        ? "사용자 정보를 불러오는데 실패했습니다."
        : "");

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastName?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === "all" || user.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "instructor":
        return "default";
      case "student":
        return "secondary";
      default:
        return "outline";
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  const aiTotals = aiSummary?.totals;

  return (
    <AdminShell title="관리자 대시보드" icon={Shield}>
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 사용자</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">강사</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.instructors}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">학생</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary-foreground">
              {stats.students}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">역할 미설정</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.noRole}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">최근 7일 AI 비용</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isAiSummaryLoading ? "-" : formatUsdMicros(aiTotals?.estimatedCostUsdMicros)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">최근 7일 AI 요청 수</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isAiSummaryLoading ? "-" : (aiTotals?.requests ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">최근 7일 실패율</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isAiSummaryLoading
                ? "-"
                : formatPercent(aiTotals?.failedRequests ?? 0, aiTotals?.requests ?? 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {pendingInstructors && pendingInstructors.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <Clock className="w-5 h-5" />
              승인 대기 강사 ({pendingInstructors.length}명)
            </CardTitle>
            <CardDescription>
              강사 승인 요청이 있습니다. 검토 후 승인해주세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingInstructors.map((instructor: {
                id: string;
                name: string;
                email: string;
                created_at: string;
              }) => (
                <div
                  key={instructor.id}
                  className="flex items-center justify-between rounded-lg border border-amber-200 bg-white dark:bg-amber-950/30 p-4"
                >
                  <div>
                    <p className="font-medium">{instructor.name || "이름 없음"}</p>
                    <p className="text-sm text-muted-foreground">{instructor.email}</p>
                    <p className="text-xs text-muted-foreground">
                      신청일: {new Date(instructor.created_at).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => approveInstructor(instructor.id)}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <UserCheck className="w-4 h-4 mr-1" />
                    승인
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>사용자 관리</CardTitle>
          <CardDescription>사용자 목록을 검색하고 역할을 관리하세요</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="이메일 또는 이름으로 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="역할 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">모든 역할</SelectItem>
                <SelectItem value="instructor">강사</SelectItem>
                <SelectItem value="student">학생</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                refetch();
                refetchAiSummary();
              }}
              variant="outline"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              새로고침
            </Button>
          </div>

          {error && <ErrorAlert message={error} />}

          <div className="space-y-4">
            {filteredUsers.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p>검색 조건에 맞는 사용자가 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        {user.imageUrl ? (
                          <div
                            className="h-10 w-10 rounded-full bg-cover bg-center"
                            style={{
                              backgroundImage: `url(${user.imageUrl})`,
                            }}
                            title={user.firstName || user.email}
                          />
                        ) : (
                          <Users className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold">
                            {user.firstName && user.lastName
                              ? `${user.firstName} ${user.lastName}`
                              : user.email}
                          </h3>
                          <Badge variant={getRoleBadgeVariant(user.role)}>
                            {user.role === "instructor"
                              ? "강사"
                              : user.role === "student"
                                ? "학생"
                                : "미설정"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        <p className="text-xs text-muted-foreground">
                          가입일: {formatDate(user.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Select
                      value={user.role}
                      onValueChange={(newRole) => updateUserRole(user.id, newRole)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instructor">강사</SelectItem>
                        <SelectItem value="student">학생</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
