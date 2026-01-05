"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent as ShadcnSidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Shield,
  Users,
  UserCheck,
  UserX,
  Search,
  RefreshCw,
  Settings,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminSidebarFooter } from "@/components/admin/AdminSidebarFooter";

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

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<UserStats>({
    total: 0,
    instructors: 0,
    students: 0,
    noRole: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      setError("");
      const response = await fetch("/api/admin/users");

      if (response.status === 403) {
        router.push("/admin/login");
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
        setStats(data.stats);
      } else {
        setError("사용자 정보를 불러오는데 실패했습니다.");
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      setError("서버 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

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
        // 사용자 목록 새로고침
        await fetchUsers();
      } else {
        setError("역할 변경에 실패했습니다.");
      }
    } catch (error) {
      console.error("Error updating user role:", error);
      setError("서버 오류가 발생했습니다.");
    }
  };

  const navigationItems = [
    {
      title: "대시보드",
      href: "/admin",
      icon: Shield,
      active: pathname === "/admin",
    },
    {
      title: "로그 기록",
      href: "/admin/logs",
      icon: FileText,
      active: pathname === "/admin/logs",
    },
  ];

  const SidebarContent = () => {
    const { state } = useSidebar();
    const isCollapsed = state === "collapsed";

    return (
      <>
        <SidebarHeader className="p-4 sm:p-5 border-b border-sidebar-border">
          <Link
            href="/admin"
            className={cn(
              "flex items-center",
              isCollapsed ? "justify-center" : "justify-start"
            )}
          >
            <Image
              src="/qstn_logo_svg.svg"
              alt="Quest-On Logo"
              width={40}
              height={40}
              className="w-10 h-10 shrink-0"
              priority
            />
            {!isCollapsed && (
              <span className="text-xl font-bold text-sidebar-foreground ml-2">
                Quest-On
              </span>
            )}
          </Link>
        </SidebarHeader>

        <ShadcnSidebarContent>
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
                    "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-sidebar group-data-[collapsible=icon]:justify-center",
                    item.active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                  aria-current={item.active ? "page" : undefined}
                  title={isCollapsed ? item.title : undefined}
                >
                  <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                  {!isCollapsed && <span>{item.title}</span>}
                </Link>
              );
            })}
          </nav>
        </ShadcnSidebarContent>

        <AdminSidebarFooter />
      </>
    );
  };

  useEffect(() => {
    // 페이지 로드 시 인증 확인
    const checkAuth = async () => {
      try {
        // 먼저 사용자 목록을 가져와서 인증 확인
        const response = await fetch("/api/admin/users");

        if (response.status === 403) {
          // 인증되지 않은 경우 로그인 페이지로 리다이렉트
          router.push("/admin/login");
          return;
        }

        if (response.ok) {
          // 인증된 경우 사용자 데이터 설정
          const data = await response.json();
          setUsers(data.users);
          setStats(data.stats);
          setIsLoading(false);
        } else {
          setError("사용자 정보를 불러오는데 실패했습니다.");
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Auth check error:", error);
        router.push("/admin/login");
      }
    };

    checkAuth();
  }, [router]);

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      defaultOpen={true}
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "4rem",
        } as React.CSSProperties
      }
    >
      <Sidebar
        side="left"
        variant="sidebar"
        collapsible="icon"
        className="border-r border-sidebar-border"
      >
        <SidebarContent />
      </Sidebar>

      {/* Mobile Sidebar Sheet */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>메뉴</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col h-full bg-sidebar">
            <div className="p-4 sm:p-5 border-b border-sidebar-border">
              <Link
                href="/admin"
                className="flex items-center justify-center"
              >
                <Image
                  src="/qstn_logo_svg.svg"
                  alt="Quest-On Logo"
                  width={40}
                  height={40}
                  className="w-10 h-10"
                  priority
                />
                <span className="text-xl font-bold text-sidebar-foreground ml-2">
                  Quest-On
                </span>
              </Link>
            </div>
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
                      "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px]",
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
            <AdminSidebarFooter />
          </div>
        </SheetContent>
      </Sheet>

      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">관리자 대시보드</h1>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        {/* Stats Overview */}
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
              <div className="text-2xl font-bold text-primary">
                {stats.instructors}
              </div>
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
              <div className="text-2xl font-bold text-destructive">
                {stats.noRole}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>사용자 관리</CardTitle>
            <CardDescription>
              사용자 목록을 검색하고 역할을 관리하세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
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
              <Button onClick={fetchUsers} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                새로고침
              </Button>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}

            {/* Users Table */}
            <div className="space-y-4">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>검색 조건에 맞는 사용자가 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                          {user.imageUrl ? (
                            <div
                              className="w-10 h-10 rounded-full bg-cover bg-center"
                              style={{
                                backgroundImage: `url(${user.imageUrl})`,
                              }}
                              title={user.firstName || user.email}
                            />
                          ) : (
                            <Users className="w-5 h-5 text-primary" />
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
                          <p className="text-sm text-muted-foreground">
                            {user.email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            가입일: {formatDate(user.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Select
                          value={user.role}
                          onValueChange={(newRole) =>
                            updateUserRole(user.id, newRole)
                          }
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
