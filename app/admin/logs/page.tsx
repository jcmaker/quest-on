"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { qk } from "@/lib/query-keys";
import { AdminShell } from "@/components/admin/AdminShell";

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
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null);
  const limit = 50;

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<LogsResponse>({
    queryKey: qk.admin.errorLogs({
      limit,
      offset: page * limit,
      level:
        levelFilter !== "all"
          ? (levelFilter as "error" | "warn" | "info")
          : undefined,
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

      if (response.status === 401 || response.status === 403) {
        router.push("/admin/login");
        throw new Error("Admin access required");
      }

      if (!response.ok) {
        throw new Error("Failed to fetch error logs");
      }

      return response.json();
    },
  });

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

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

  return (
    <AdminShell title="에러 로그 관리" icon={FileText}>
      {isLoading ? (
        <div className="flex h-[50vh] items-center justify-center">
          <div className="text-center">
            <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin" />
            <p className="text-muted-foreground">로딩 중...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex h-[50vh] items-center justify-center">
          <div className="text-center">
            <AlertCircle className="mx-auto mb-4 h-8 w-8 text-destructive" />
            <p className="text-destructive">에러 로그를 불러오는데 실패했습니다.</p>
            <Button onClick={() => refetch()} className="mt-4">
              다시 시도
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>필터</CardTitle>
              <CardDescription>로그 레벨별로 필터링할 수 있습니다</CardDescription>
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
                  <RefreshCw className="mr-2 h-4 w-4" />
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

          <Card>
            <CardHeader>
              <CardTitle>에러 로그 목록</CardTitle>
              <CardDescription>
                최근 발생한 에러 로그를 확인하세요. 행을 클릭하면 상세 정보를 볼 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data && data.logs.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <FileText className="mx-auto mb-4 h-12 w-12 opacity-50" />
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
                              {log.user_id ? `${log.user_id.substring(0, 8)}...` : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((current) => Math.max(0, current - 1))}
                        disabled={page === 0}
                      >
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        이전
                      </Button>
                      <div className="text-sm text-muted-foreground">
                        페이지 {page + 1} / {totalPages}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPage((current) => Math.min(totalPages - 1, current + 1))
                        }
                        disabled={page >= totalPages - 1}
                      >
                        다음
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>로그 상세 정보</DialogTitle>
                <DialogDescription>
                  {selectedLog ? formatDate(selectedLog.created_at) : ""}
                </DialogDescription>
              </DialogHeader>
              {selectedLog && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-sm font-medium">레벨</p>
                      <Badge variant={getLevelBadgeVariant(selectedLog.level)}>
                        {getLevelLabel(selectedLog.level)}
                      </Badge>
                    </div>
                    <div>
                      <p className="mb-1 text-sm font-medium">사용자 ID</p>
                      <p className="font-mono text-sm text-muted-foreground">
                        {selectedLog.user_id || "-"}
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="mb-1 text-sm font-medium">경로</p>
                      <p className="font-mono text-sm text-muted-foreground">
                        {selectedLog.path || "-"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-sm font-medium">메시지</p>
                    <div className="rounded-md bg-muted p-3 text-sm">{selectedLog.message}</div>
                  </div>

                  <div>
                    <p className="mb-1 text-sm font-medium">Payload</p>
                    <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                      {JSON.stringify(selectedLog.payload ?? {}, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </AdminShell>
  );
}
