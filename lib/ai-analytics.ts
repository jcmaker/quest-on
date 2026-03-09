import type { AiFeature } from "@/lib/ai-pricing";

export type AiEventStatus = "success" | "error" | "timeout";
export type AiUsageRange = "7d" | "30d" | "90d";

type UnknownRecord = Record<string, unknown>;

export interface AdminAiUsageFilters {
  range: AiUsageRange;
  feature?: AiFeature;
  model?: string;
  examId?: string;
  sessionId?: string;
  status?: AiEventStatus;
}

export interface AiEventRecord {
  id: string;
  provider: string;
  endpoint: string;
  feature: string;
  route: string;
  model: string;
  userId: string | null;
  examId: string | null;
  sessionId: string | null;
  qIdx: number | null;
  status: AiEventStatus;
  attemptCount: number;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsdMicros: number;
  pricingVersion: string;
  requestId: string | null;
  responseId: string | null;
  errorCode: string | null;
  metadata: UnknownRecord;
  createdAt: string;
  examTitle?: string | null;
}

export interface AiUsageTotals {
  requests: number;
  successRequests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsdMicros: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

export interface DailyUsagePoint {
  date: string;
  requests: number;
  estimatedCostUsdMicros: number;
  totalTokens: number;
}

type BreakdownRow = {
  key: string;
  label: string;
  requests: number;
  successRequests: number;
  failedRequests: number;
  totalTokens: number;
  estimatedCostUsdMicros: number;
  avgLatencyMs: number;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : {};
}

function getPercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)
  );

  return sorted[index] ?? 0;
}

function getBucketDate(value: string): string {
  return value.slice(0, 10);
}

function createDateSeries(range: AiUsageRange): string[] {
  const dayCount = range === "30d" ? 30 : range === "90d" ? 90 : 7;
  const dates: string[] = [];
  const now = new Date();

  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - offset);
    dates.push(date.toISOString().slice(0, 10));
  }

  return dates;
}

export function parseAiUsageFilters(
  searchParams: URLSearchParams
): AdminAiUsageFilters {
  const rangeValue = searchParams.get("range");
  const range: AiUsageRange =
    rangeValue === "30d" || rangeValue === "90d" ? rangeValue : "7d";

  const feature = searchParams.get("feature") || undefined;
  const model = searchParams.get("model") || undefined;
  const examId = searchParams.get("examId") || undefined;
  const sessionId = searchParams.get("sessionId") || undefined;
  const statusValue = searchParams.get("status");
  const status: AiEventStatus | undefined =
    statusValue === "success" ||
    statusValue === "error" ||
    statusValue === "timeout"
      ? statusValue
      : undefined;

  return {
    range,
    feature: feature as AiFeature | undefined,
    model,
    examId,
    sessionId,
    status,
  };
}

export function getRangeStartIso(range: AiUsageRange): string {
  const now = new Date();
  const days = range === "30d" ? 30 : range === "90d" ? 90 : 7;
  now.setUTCDate(now.getUTCDate() - days);
  return now.toISOString();
}

export function normalizeAiEventRow(row: Record<string, unknown>): AiEventRecord {
  return {
    id: String(row.id ?? ""),
    provider: String(row.provider ?? "openai"),
    endpoint: String(row.endpoint ?? ""),
    feature: String(row.feature ?? ""),
    route: String(row.route ?? ""),
    model: String(row.model ?? ""),
    userId: typeof row.user_id === "string" ? row.user_id : null,
    examId: typeof row.exam_id === "string" ? row.exam_id : null,
    sessionId: typeof row.session_id === "string" ? row.session_id : null,
    qIdx: toNullableNumber(row.q_idx),
    status:
      row.status === "error" || row.status === "timeout" ? row.status : "success",
    attemptCount: toNumber(row.attempt_count) || 1,
    latencyMs: toNullableNumber(row.latency_ms),
    inputTokens: toNullableNumber(row.input_tokens),
    outputTokens: toNullableNumber(row.output_tokens),
    cachedInputTokens: toNullableNumber(row.cached_input_tokens),
    reasoningTokens: toNullableNumber(row.reasoning_tokens),
    totalTokens: toNullableNumber(row.total_tokens),
    estimatedCostUsdMicros: toNumber(row.estimated_cost_usd_micros),
    pricingVersion: String(row.pricing_version ?? ""),
    requestId: typeof row.request_id === "string" ? row.request_id : null,
    responseId: typeof row.response_id === "string" ? row.response_id : null,
    errorCode: typeof row.error_code === "string" ? row.error_code : null,
    metadata: toRecord(row.metadata),
    createdAt: String(row.created_at ?? ""),
    examTitle: typeof row.exam_title === "string" ? row.exam_title : null,
  };
}

export function summarizeAiEvents(
  rows: AiEventRecord[],
  range: AiUsageRange
): { totals: AiUsageTotals; daily: DailyUsagePoint[] } {
  const dailyMap = new Map<string, DailyUsagePoint>();

  for (const date of createDateSeries(range)) {
    dailyMap.set(date, {
      date,
      requests: 0,
      estimatedCostUsdMicros: 0,
      totalTokens: 0,
    });
  }

  const latencies: number[] = [];
  const totals = rows.reduce<AiUsageTotals>(
    (acc, row) => {
      acc.requests += 1;
      if (row.status === "success") {
        acc.successRequests += 1;
      } else {
        acc.failedRequests += 1;
      }
      acc.inputTokens += row.inputTokens ?? 0;
      acc.outputTokens += row.outputTokens ?? 0;
      acc.totalTokens += row.totalTokens ?? 0;
      acc.estimatedCostUsdMicros += row.estimatedCostUsdMicros;

      if (typeof row.latencyMs === "number") {
        latencies.push(row.latencyMs);
      }

      const date = getBucketDate(row.createdAt);
      const bucket = dailyMap.get(date);
      if (bucket) {
        bucket.requests += 1;
        bucket.estimatedCostUsdMicros += row.estimatedCostUsdMicros;
        bucket.totalTokens += row.totalTokens ?? 0;
      }

      return acc;
    },
    {
      requests: 0,
      successRequests: 0,
      failedRequests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsdMicros: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
    }
  );

  if (latencies.length > 0) {
    totals.avgLatencyMs = Math.round(
      latencies.reduce((sum, value) => sum + value, 0) / latencies.length
    );
    totals.p95LatencyMs = getPercentile(latencies, 95);
  }

  return {
    totals,
    daily: Array.from(dailyMap.values()),
  };
}

function aggregateBreakdown(
  rows: AiEventRecord[],
  getKey: (row: AiEventRecord) => { key: string; label: string } | null
): BreakdownRow[] {
  const buckets = new Map<string, BreakdownRow>();

  for (const row of rows) {
    const target = getKey(row);
    if (!target) continue;

    const existing = buckets.get(target.key) ?? {
      key: target.key,
      label: target.label,
      requests: 0,
      successRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      estimatedCostUsdMicros: 0,
      avgLatencyMs: 0,
    };

    existing.requests += 1;
    if (row.status === "success") {
      existing.successRequests += 1;
    } else {
      existing.failedRequests += 1;
    }
    existing.totalTokens += row.totalTokens ?? 0;
    existing.estimatedCostUsdMicros += row.estimatedCostUsdMicros;
    existing.avgLatencyMs += row.latencyMs ?? 0;

    buckets.set(target.key, existing);
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      ...bucket,
      avgLatencyMs:
        bucket.requests > 0
          ? Math.round(bucket.avgLatencyMs / bucket.requests)
          : 0,
    }))
    .sort((a, b) => b.estimatedCostUsdMicros - a.estimatedCostUsdMicros);
}

export function buildAiUsageBreakdown(
  rows: AiEventRecord[]
): {
  byFeature: BreakdownRow[];
  byModel: BreakdownRow[];
  byExam: BreakdownRow[];
  bySession?: BreakdownRow[];
} {
  return {
    byFeature: aggregateBreakdown(rows, (row) => ({
      key: row.feature,
      label: row.feature,
    })),
    byModel: aggregateBreakdown(rows, (row) => ({
      key: row.model,
      label: row.model,
    })),
    byExam: aggregateBreakdown(rows, (row) =>
      row.examId
        ? {
            key: row.examId,
            label: row.examTitle || row.examId,
          }
        : null
    ),
    bySession: aggregateBreakdown(rows, (row) =>
      row.sessionId
        ? {
            key: row.sessionId,
            label: row.sessionId,
          }
        : null
    ),
  };
}
