import { getSupabaseServer } from "@/lib/supabase-server";
import {
  getRangeStartIso,
  normalizeAiEventRow,
  type AdminAiUsageFilters,
  type AiEventRecord,
} from "@/lib/ai-analytics";

const AI_EVENT_SELECT = `
  id,
  provider,
  endpoint,
  feature,
  route,
  model,
  user_id,
  exam_id,
  session_id,
  q_idx,
  status,
  attempt_count,
  latency_ms,
  input_tokens,
  output_tokens,
  cached_input_tokens,
  reasoning_tokens,
  total_tokens,
  estimated_cost_usd_micros,
  pricing_version,
  request_id,
  response_id,
  error_code,
  metadata,
  created_at
`;

function applyAiUsageFilters<
  T extends {
    gte: (column: string, value: string) => T;
    eq: (column: string, value: string) => T;
  },
>(query: T, filters: AdminAiUsageFilters): T {
  let next = query.gte("created_at", getRangeStartIso(filters.range));

  if (filters.feature) {
    next = next.eq("feature", filters.feature);
  }
  if (filters.model) {
    next = next.eq("model", filters.model);
  }
  if (filters.examId) {
    next = next.eq("exam_id", filters.examId);
  }
  if (filters.sessionId) {
    next = next.eq("session_id", filters.sessionId);
  }
  if (filters.status) {
    next = next.eq("status", filters.status);
  }

  return next;
}

async function attachExamTitles(rows: AiEventRecord[]): Promise<AiEventRecord[]> {
  const examIds = Array.from(
    new Set(rows.map((row) => row.examId).filter((value): value is string => !!value))
  );

  if (examIds.length === 0) {
    return rows;
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("exams")
    .select("id, title")
    .in("id", examIds);

  if (error) {
    throw error;
  }

  const titleMap = new Map(
    (data || []).map((exam) => [exam.id as string, exam.title as string])
  );

  return rows.map((row) => ({
    ...row,
    examTitle: row.examId ? titleMap.get(row.examId) ?? row.examId : null,
  }));
}

export async function listAiEvents(
  filters: AdminAiUsageFilters
): Promise<AiEventRecord[]> {
  const supabase = getSupabaseServer();
  let query = supabase
    .from("ai_events")
    .select(AI_EVENT_SELECT)
    .order("created_at", { ascending: false });

  query = applyAiUsageFilters(query, filters);

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return attachExamTitles((data || []).map(normalizeAiEventRow));
}

export async function listPagedAiEvents(params: {
  filters: AdminAiUsageFilters;
  page: number;
  limit: number;
}): Promise<{ rows: AiEventRecord[]; total: number }> {
  const supabase = getSupabaseServer();
  const safePage = Math.max(1, params.page);
  const from = (safePage - 1) * params.limit;
  const to = from + params.limit - 1;

  let query = supabase
    .from("ai_events")
    .select(AI_EVENT_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  query = applyAiUsageFilters(query, params.filters);

  const { data, error, count } = await query;

  if (error) {
    throw error;
  }

  return {
    rows: await attachExamTitles((data || []).map(normalizeAiEventRow)),
    total: count || 0,
  };
}
