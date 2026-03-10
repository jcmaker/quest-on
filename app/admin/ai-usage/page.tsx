"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  DollarSign,
  FileText,
  RefreshCw,
  Search,
  Timer,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ErrorAlert } from "@/components/ui/error-alert";
import { AI_FEATURES } from "@/lib/ai-pricing";
import { qk } from "@/lib/query-keys";

type RangeValue = "7d" | "30d" | "90d";
type StatusValue = "all" | "success" | "error" | "timeout";

interface SummaryResponse {
  totals: {
    requests: number;
    successRequests: number;
    failedRequests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsdMicros: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
  };
  daily: Array<{
    date: string;
    requests: number;
    estimatedCostUsdMicros: number;
    totalTokens: number;
  }>;
}

interface BreakdownRow {
  key: string;
  label: string;
  requests: number;
  successRequests: number;
  failedRequests: number;
  totalTokens: number;
  estimatedCostUsdMicros: number;
  avgLatencyMs: number;
}

interface BreakdownResponse {
  byFeature: BreakdownRow[];
  byModel: BreakdownRow[];
  byExam: BreakdownRow[];
  bySession?: BreakdownRow[];
}

interface EventRow {
  id: string;
  feature: string;
  model: string;
  route: string;
  endpoint: string;
  status: "success" | "error" | "timeout";
  sessionId: string | null;
  examId: string | null;
  examTitle?: string | null;
  qIdx: number | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsdMicros: number;
  requestId: string | null;
  responseId: string | null;
  errorCode: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface EventsResponse {
  events: EventRow[];
  total: number;
  page: number;
  limit: number;
}

function formatUsdMicros(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value / 1_000_000);
}

function formatPercent(numerator: number, denominator: number): string {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCompactDate(value: string): string {
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

function buildSearchParams(filters: {
  range: RangeValue;
  feature: string;
  model: string;
  examId: string;
  sessionId: string;
  status: StatusValue;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams({ range: filters.range });

  if (filters.feature !== "all") params.set("feature", filters.feature);
  if (filters.model.trim()) params.set("model", filters.model.trim());
  if (filters.examId.trim()) params.set("examId", filters.examId.trim());
  if (filters.sessionId.trim()) params.set("sessionId", filters.sessionId.trim());
  if (filters.status !== "all") params.set("status", filters.status);
  if (typeof filters.page === "number") params.set("page", String(filters.page));
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));

  return params.toString();
}

const dailyChartConfig = {
  cost: {
    label: "비용",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

const featureChartConfig = {
  cost: {
    label: "비용",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

export default function AdminAiUsagePage() {
  const router = useRouter();
  const [range, setRange] = useState<RangeValue>("7d");
  const [feature, setFeature] = useState<string>("all");
  const [status, setStatus] = useState<StatusValue>("all");
  const [model, setModel] = useState("");
  const [examId, setExamId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [page, setPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);
  const limit = 25;

  const baseFilters = useMemo(
    () => ({
      range,
      feature,
      model,
      examId,
      sessionId,
      status,
    }),
    [examId, feature, model, range, sessionId, status]
  );

  const handleUnauthorized = (response: Response) => {
    if (response.status === 401 || response.status === 403) {
      router.push("/admin/login");
      throw new Error("Admin access required");
    }
  };

  const summaryQuery = useQuery<SummaryResponse>({
    queryKey: qk.admin.aiUsageSummary({
      range,
      feature: feature !== "all" ? feature : undefined,
      model: model || undefined,
      examId: examId || undefined,
      status: status !== "all" ? status : undefined,
    }),
    queryFn: async () => {
      const response = await fetch(
        `/api/admin/ai-usage/summary?${buildSearchParams({
          ...baseFilters,
        })}`
      );
      handleUnauthorized(response);
      if (!response.ok) throw new Error("AI 사용량 요약을 불러오는데 실패했습니다.");
      return response.json();
    },
  });

  const breakdownQuery = useQuery<BreakdownResponse>({
    queryKey: qk.admin.aiUsageBreakdown({
      range,
      feature: feature !== "all" ? feature : undefined,
      model: model || undefined,
      examId: examId || undefined,
      status: status !== "all" ? status : undefined,
    }),
    queryFn: async () => {
      const response = await fetch(
        `/api/admin/ai-usage/breakdown?${buildSearchParams({
          ...baseFilters,
        })}`
      );
      handleUnauthorized(response);
      if (!response.ok) throw new Error("AI 사용량 상세를 불러오는데 실패했습니다.");
      return response.json();
    },
  });

  const eventsQuery = useQuery<EventsResponse>({
    queryKey: qk.admin.aiUsageEvents({
      range,
      page,
      limit,
      feature: feature !== "all" ? feature : undefined,
      model: model || undefined,
      examId: examId || undefined,
      sessionId: sessionId || undefined,
      status: status !== "all" ? status : undefined,
    }),
    queryFn: async () => {
      const response = await fetch(
        `/api/admin/ai-usage/events?${buildSearchParams({
          ...baseFilters,
          page,
          limit,
        })}`
      );
      handleUnauthorized(response);
      if (!response.ok) throw new Error("AI 이벤트를 불러오는데 실패했습니다.");
      return response.json();
    },
  });

  const summary = summaryQuery.data;
  const breakdown = breakdownQuery.data;
  const events = eventsQuery.data;
  const totalPages = events ? Math.ceil(events.total / events.limit) : 0;
  const dailyChartData =
    summary?.daily.map((row) => ({
      ...row,
      cost: Number((row.estimatedCostUsdMicros / 1_000_000).toFixed(4)),
    })) ?? [];
  const featureChartData =
    breakdown?.byFeature.slice(0, 8).map((row) => ({
      ...row,
      cost: Number((row.estimatedCostUsdMicros / 1_000_000).toFixed(4)),
    })) ?? [];

  const errorMessage =
    (summaryQuery.error as Error | null)?.message ||
    (breakdownQuery.error as Error | null)?.message ||
    (eventsQuery.error as Error | null)?.message ||
    "";

  return (
    <AdminShell title="AI 사용량" icon={Bot}>
      <Card>
        <CardHeader>
          <CardTitle>필터</CardTitle>
          <CardDescription>
            기간과 feature/model/exam 기준으로 AI 비용과 이벤트를 확인합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Select
              value={range}
              onValueChange={(value) => {
                setRange(value as RangeValue);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="기간" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">최근 7일</SelectItem>
                <SelectItem value="30d">최근 30일</SelectItem>
                <SelectItem value="90d">최근 90일</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={feature}
              onValueChange={(value) => {
                setFeature(value);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Feature" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">모든 feature</SelectItem>
                {AI_FEATURES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as StatusValue);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">모든 상태</SelectItem>
                <SelectItem value="success">성공</SelectItem>
                <SelectItem value="error">에러</SelectItem>
                <SelectItem value="timeout">타임아웃</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="모델명 exact match"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setPage(1);
              }}
            />
            <Input
              placeholder="시험 ID"
              value={examId}
              onChange={(e) => {
                setExamId(e.target.value);
                setPage(1);
              }}
            />
            <Input
              placeholder="세션 ID"
              value={sessionId}
              onChange={(e) => {
                setSessionId(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                summaryQuery.refetch();
                breakdownQuery.refetch();
                eventsQuery.refetch();
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              새로고침
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setRange("7d");
                setFeature("all");
                setStatus("all");
                setModel("");
                setExamId("");
                setSessionId("");
                setPage(1);
              }}
            >
              초기화
            </Button>
          </div>

          {errorMessage && <ErrorAlert message={errorMessage} />}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 비용</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatUsdMicros(summary.totals.estimatedCostUsdMicros) : "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 요청</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? summary.totals.requests.toLocaleString() : "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 토큰</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? summary.totals.totalTokens.toLocaleString() : "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">평균 비용/요청</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary
                ? formatUsdMicros(
                    summary.totals.requests === 0
                      ? 0
                      : Math.round(
                          summary.totals.estimatedCostUsdMicros /
                            summary.totals.requests
                        )
                  )
                : "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">실패율</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary
                ? formatPercent(summary.totals.failedRequests, summary.totals.requests)
                : "-"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              p95 latency {summary?.totals.p95LatencyMs ?? 0}ms
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>일별 비용 추이</CardTitle>
            <CardDescription>선택한 기간 내 일별 비용 흐름입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={dailyChartConfig} className="h-[280px] w-full">
              <LineChart data={dailyChartData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatCompactDate}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tickFormatter={(value) => `$${value}`} tickLine={false} axisLine={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => (
                        <span className="font-mono">{`$${value}`}</span>
                      )}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="var(--color-cost)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feature별 비용</CardTitle>
            <CardDescription>비용 상위 8개 feature를 표시합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={featureChartConfig} className="h-[280px] w-full">
              <BarChart data={featureChartData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(value) => `$${value}`} tickLine={false} axisLine={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => (
                        <span className="font-mono">{`$${value}`}</span>
                      )}
                    />
                  }
                />
                <Bar dataKey="cost" fill="var(--color-cost)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>모델별 집계</CardTitle>
            <CardDescription>모델별 요청 수와 비용입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>모델</TableHead>
                    <TableHead className="text-right">요청</TableHead>
                    <TableHead className="text-right">토큰</TableHead>
                    <TableHead className="text-right">비용</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdown?.byModel.slice(0, 10).map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-mono text-xs">{row.label}</TableCell>
                      <TableCell className="text-right">{row.requests.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{row.totalTokens.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {formatUsdMicros(row.estimatedCostUsdMicros)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>시험별 집계</CardTitle>
            <CardDescription>시험 기준 비용 hotspot입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>시험</TableHead>
                    <TableHead className="text-right">요청</TableHead>
                    <TableHead className="text-right">토큰</TableHead>
                    <TableHead className="text-right">비용</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdown?.byExam.slice(0, 10).map((row) => (
                    <TableRow
                      key={row.key}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        setExamId(row.key);
                        setPage(1);
                      }}
                    >
                      <TableCell>{row.label}</TableCell>
                      <TableCell className="text-right">{row.requests.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{row.totalTokens.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {formatUsdMicros(row.estimatedCostUsdMicros)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {examId && breakdown?.bySession && breakdown.bySession.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>세션별 집계</CardTitle>
            <CardDescription>선택한 시험 안에서 세션별 비용을 확인합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>세션</TableHead>
                    <TableHead className="text-right">요청</TableHead>
                    <TableHead className="text-right">토큰</TableHead>
                    <TableHead className="text-right">비용</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdown.bySession.slice(0, 10).map((row) => (
                    <TableRow
                      key={row.key}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        setSessionId(row.key);
                        setPage(1);
                      }}
                    >
                      <TableCell className="font-mono text-xs">{row.label}</TableCell>
                      <TableCell className="text-right">{row.requests.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{row.totalTokens.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {formatUsdMicros(row.estimatedCostUsdMicros)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>최근 이벤트</CardTitle>
          <CardDescription>
            raw AI 이벤트 목록입니다. 행을 클릭하면 request/response id와 metadata를 확인합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시간</TableHead>
                  <TableHead>Feature</TableHead>
                  <TableHead>모델</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">비용</TableHead>
                  <TableHead className="text-right">토큰</TableHead>
                  <TableHead className="text-right">지연</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events?.events.length ? (
                  events.events.map((event) => (
                    <TableRow
                      key={event.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedEvent(event)}
                    >
                      <TableCell className="font-mono text-xs">
                        {formatDateTime(event.createdAt)}
                      </TableCell>
                      <TableCell>{event.feature}</TableCell>
                      <TableCell className="font-mono text-xs">{event.model}</TableCell>
                      <TableCell>{event.status}</TableCell>
                      <TableCell className="text-right">
                        {formatUsdMicros(event.estimatedCostUsdMicros)}
                      </TableCell>
                      <TableCell className="text-right">
                        {(event.totalTokens ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {event.latencyMs ?? 0}ms
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      <Search className="mx-auto mb-3 h-10 w-10 opacity-50" />
                      이벤트가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
              >
                이전
              </Button>
              <div className="text-sm text-muted-foreground">
                페이지 {page} / {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
              >
                다음
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>AI 이벤트 상세</DialogTitle>
            <DialogDescription>
              {selectedEvent ? formatDateTime(selectedEvent.createdAt) : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedEvent && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium">Feature</p>
                  <p className="text-sm text-muted-foreground">{selectedEvent.feature}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">모델</p>
                  <p className="font-mono text-sm text-muted-foreground">{selectedEvent.model}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">상태</p>
                  <p className="text-sm text-muted-foreground">{selectedEvent.status}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">지연 시간</p>
                  <p className="text-sm text-muted-foreground">{selectedEvent.latencyMs ?? 0}ms</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Request ID</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {selectedEvent.requestId || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Response ID</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {selectedEvent.responseId || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Exam</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedEvent.examTitle || selectedEvent.examId || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Session</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {selectedEvent.sessionId || "-"}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <p className="text-sm font-medium">Input</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedEvent.inputTokens ?? 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Output</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedEvent.outputTokens ?? 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Total</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedEvent.totalTokens ?? 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">비용</p>
                  <p className="text-sm text-muted-foreground">
                    {formatUsdMicros(selectedEvent.estimatedCostUsdMicros)}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-1 text-sm font-medium">Metadata</p>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(selectedEvent.metadata ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
