"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileText,
  Shield,
} from "lucide-react";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { AdminSidebarFooter } from "@/components/admin/AdminSidebarFooter";

interface ErrorLog {
  id: string;
  created_at: string;
  user_id: string | null;
  level: "error" | "warn" | "info";
  message: string;
  payload: Record<string, unknown> | null;
  path: string | null;
}

interface LogsResponse {
  logs: ErrorLog[];
  total: number;
  limit: number;
  offset: number;
}

export default function AdminLogsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const limit = 50;

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

  // 로그 데이터 가져오기
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<LogsResponse>({
    queryKey: qk.admin.errorLogs({
      limit,
      offset: page * limit,
      level: levelFilter !== "all" ? (levelFilter as "error" | "warn" | "info") : undefined,
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      });

      if (levelFilter !== "all") {
        params.append("level", levelFilter);
      }

      const response = await fetch(`/api/admin/logs?${params.toString()}`);

      if (response.status === 403) {
        router.push("/admin/login");
        throw new Error("Admin access required");
      }

      if (!response.ok) {
        throw new Error("Failed to fetch error logs");
      }

      return response.json();
    },
  });

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth", { method: "DELETE" });
      router.push("/admin/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getLevelBadgeVariant = (level: string) => {
    switch (level) {
      case "error":
        return "destructive";
      case "warn":
        return "default";
      case "info":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getLevelLabel = (level: string) => {
    switch (level) {
      case "error":
        return "에러";
      case "warn":
        return "경고";
      case "info":
        return "정보";
      default:
        return level;
    }
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  if (isLoading) {
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
        <SidebarInset>
          <div className="flex h-screen items-center justify-center">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">로딩 중...</p>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  if (error) {
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
        <SidebarInset>
          <div className="flex h-screen items-center justify-center">
            <div className="text-center">
              <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-4" />
              <p className="text-destructive">에러 로그를 불러오는데 실패했습니다.</p>
              <Button onClick={() => refetch()} className="mt-4">
                다시 시도
              </Button>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
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
            <FileText className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">에러 로그 관리</h1>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>필터</CardTitle>
            <CardDescription>
              로그 레벨별로 필터링할 수 있습니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="로그 레벨" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 레벨</SelectItem>
                  <SelectItem value="error">에러만</SelectItem>
                  <SelectItem value="warn">경고만</SelectItem>
                  <SelectItem value="info">정보만</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => refetch()} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                새로고침
              </Button>
              {data && (
                <div className="ml-auto text-sm text-muted-foreground">
                  총 {data.total}개의 로그
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>에러 로그 목록</CardTitle>
            <CardDescription>
              최근 발생한 에러 로그를 확인하세요. 행을 클릭하면 상세 정보를 볼 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data && data.logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>로그가 없습니다.</p>
              </div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">시간</TableHead>
                        <TableHead className="w-[100px]">레벨</TableHead>
                        <TableHead>메시지</TableHead>
                        <TableHead className="w-[200px]">경로</TableHead>
                        <TableHead className="w-[150px]">사용자 ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.logs.map((log) => (
                        <TableRow
                          key={log.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedLog(log)}
                        >
                          <TableCell className="font-mono text-xs">
                            {formatDate(log.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getLevelBadgeVariant(log.level)}>
                              {getLevelLabel(log.level)}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-md truncate">
                            {log.message}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {log.path || "-"}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {log.user_id ? log.user_id.substring(0, 8) + "..." : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="w-4 h-4 mr-2" />
                      이전
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      페이지 {page + 1} / {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      다음
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
        </main>

        {/* Log Detail Dialog */}
        <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>로그 상세 정보</DialogTitle>
              <DialogDescription>
                {selectedLog && formatDate(selectedLog.created_at)}
              </DialogDescription>
            </DialogHeader>
            {selectedLog && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">레벨</p>
                    <Badge variant={getLevelBadgeVariant(selectedLog.level)} className="mt-1">
                      {getLevelLabel(selectedLog.level)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">사용자 ID</p>
                    <p className="mt-1 font-mono text-sm">
                      {selectedLog.user_id || "-"}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-muted-foreground">경로</p>
                    <p className="mt-1 font-mono text-sm break-all">
                      {selectedLog.path || "-"}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-muted-foreground">메시지</p>
                    <p className="mt-1 text-sm break-words">{selectedLog.message}</p>
                  </div>
                </div>
                {selectedLog.payload && Object.keys(selectedLog.payload).length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      페이로드 (JSON)
                    </p>
                    <pre className="bg-muted p-4 rounded-md overflow-x-auto text-xs">
                      {JSON.stringify(selectedLog.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}

