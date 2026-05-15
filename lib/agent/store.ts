/**
 * Quest-On 강사 AI 에이전트 — 영속화 계층 (agent_runs 테이블)
 *
 * API 라우트(/api/agent/*)와 러너가 이 헬퍼들을 통해서만 agent_runs 를 읽고 쓴다.
 * 공개 타입은 lib/agent/types.ts 에서 가져온다. (그 파일은 수정 금지)
 *
 * 데이터 레이어: 코드베이스 전체와 동일하게 Supabase 서버 클라이언트를 쓴다.
 * Prisma 는 이 레포에서 스키마/타입 생성 도구로만 쓰이고 런타임 사용은 0건이다.
 * (CLAUDE.md 의 "Use Prisma" 규칙은 stale — 실제 컨벤션은 Supabase.)
 *
 * 인증·소유권 체크는 이 계층의 책임이 아니다. 호출하는 API 라우트가
 * currentUser() 와 actor_id 일치 여부를 확인한다.
 */

import { getSupabaseServer } from "@/lib/supabase-server";

import type { AgentRun, AgentStep } from "@/lib/agent/types";

const TABLE = "agent_runs";

// ── 러너 내부용 확장 타입 ────────────────────────────────────────────────
/**
 * 러너가 다루는 런 형태. 공개 AgentRun 에 더해 OpenAI 응답 체이닝 및
 * 대기 중 function call 을 추적하는 내부 필드를 포함한다.
 * API/UI 응답에는 공개 AgentRun 형태만 노출해야 한다.
 */
export type AgentRunRecord = AgentRun & {
  lastResponseId: string | null;
  pendingToolCalls: unknown;
  /** 협조적 취소 플래그 — 러너가 루프 각 반복 시작 시 확인한다. */
  cancelRequested: boolean;
};

// ── DB row 형태 ──────────────────────────────────────────────────────────
/** Supabase 가 반환하는 agent_runs row. timestamptz 는 ISO 문자열로 온다. */
interface AgentRunRow {
  id: string;
  type: string;
  actor_id: string;
  actor_role: string;
  status: string;
  title: string | null;
  input: unknown;
  steps: unknown;
  output: unknown;
  exam_id: string | null;
  last_response_id: string | null;
  pending_tool_calls: unknown;
  cancel_requested: boolean | null;
  error: string | null;
  tokens_used: number | null;
  cost_usd_micros: number | string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** timestamptz 문자열을 types.ts 계약(ISO 8601, Z 형식)으로 정규화한다. */
function toIso(value: string): string {
  return new Date(value).toISOString();
}

/** snake_case DB row → camelCase AgentRunRecord. */
export function mapRowToAgentRunRecord(row: AgentRunRow): AgentRunRecord {
  return {
    id: row.id,
    type: row.type as AgentRun["type"],
    actorId: row.actor_id,
    actorRole: row.actor_role as AgentRun["actorRole"],
    status: row.status as AgentRun["status"],
    title: row.title,
    input: (row.input ?? null) as AgentRun["input"],
    steps: (row.steps ?? []) as unknown as AgentStep[],
    output: (row.output ?? null) as AgentRun["output"],
    examId: row.exam_id,
    error: row.error,
    tokensUsed: row.tokens_used ?? 0,
    costUsdMicros: Number(row.cost_usd_micros ?? 0),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
    // 러너 내부 필드
    lastResponseId: row.last_response_id,
    pendingToolCalls: row.pending_tool_calls ?? null,
    cancelRequested: row.cancel_requested ?? false,
  };
}

// ── 생성 ─────────────────────────────────────────────────────────────────
export async function createAgentRun(params: {
  type: AgentRun["type"];
  actorId: string;
  actorRole: AgentRun["actorRole"];
  input: AgentRun["input"];
  title?: string;
}): Promise<AgentRunRecord> {
  const { data, error } = await getSupabaseServer()
    .from(TABLE)
    .insert({
      type: params.type,
      actor_id: params.actorId,
      actor_role: params.actorRole,
      status: "queued",
      title: params.title ?? null,
      input: params.input,
      steps: [],
    })
    .select()
    .single();

  if (error) throw new Error(`createAgentRun failed: ${error.message}`);
  return mapRowToAgentRunRecord(data as AgentRunRow);
}

// ── 단건 조회 ────────────────────────────────────────────────────────────
export async function getAgentRun(id: string): Promise<AgentRunRecord | null> {
  const { data, error } = await getSupabaseServer()
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getAgentRun failed: ${error.message}`);
  return data ? mapRowToAgentRunRecord(data as AgentRunRow) : null;
}

// ── 목록 조회 (최신순) ───────────────────────────────────────────────────
export async function listAgentRuns(
  actorId: string,
  opts?: { limit?: number; type?: string }
): Promise<AgentRunRecord[]> {
  let query = getSupabaseServer()
    .from(TABLE)
    .select("*")
    .eq("actor_id", actorId)
    .order("created_at", { ascending: false });

  if (opts?.type) query = query.eq("type", opts.type);
  if (opts?.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) throw new Error(`listAgentRuns failed: ${error.message}`);
  return (data ?? []).map((r) => mapRowToAgentRunRecord(r as AgentRunRow));
}

// ── 스텝 추가 ────────────────────────────────────────────────────────────
/**
 * steps JSON 배열 끝에 새 스텝을 push 하고 updated_at 을 갱신한다.
 * id(uuid)와 createdAt(ISO)은 여기서 생성한다.
 *
 * 한계: read-modify-write 방식이라 같은 run 에 대한 동시 append 가 발생하면
 * 마지막 쓰기가 이긴다(lost update). MVP 기준 run 당 동시 쓰기가 없다고
 * 가정한다(러너는 run 당 직렬 실행). 동시성이 생기면 steps 를 별도 테이블로
 * 분리하거나 DB 레벨 잠금이 필요하다.
 */
export async function appendAgentStep(
  runId: string,
  step: Omit<AgentStep, "id" | "createdAt">
): Promise<AgentRunRecord> {
  const supabase = getSupabaseServer();

  const { data: existing, error: readError } = await supabase
    .from(TABLE)
    .select("steps")
    .eq("id", runId)
    .maybeSingle();

  if (readError) {
    throw new Error(`appendAgentStep read failed: ${readError.message}`);
  }
  if (!existing) throw new Error(`agent_run not found: ${runId}`);

  const fullStep: AgentStep = {
    ...step,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  const currentSteps = (existing.steps ?? []) as AgentStep[];
  const nextSteps = [...currentSteps, fullStep];

  const { data, error } = await supabase
    .from(TABLE)
    .update({ steps: nextSteps, updated_at: new Date().toISOString() })
    .eq("id", runId)
    .select()
    .single();

  if (error) throw new Error(`appendAgentStep failed: ${error.message}`);
  return mapRowToAgentRunRecord(data as AgentRunRow);
}

// ── 부분 갱신 ────────────────────────────────────────────────────────────
export async function patchAgentRun(
  id: string,
  patch: Partial<{
    status: AgentRun["status"];
    title: string | null;
    output: AgentRun["output"];
    examId: string | null;
    error: string | null;
    lastResponseId: string | null;
    pendingToolCalls: unknown;
    cancelRequested: boolean;
    tokensUsed: number;
    costUsdMicros: number;
    completedAt: string | null;
  }>
): Promise<AgentRunRecord> {
  // updated_at 은 항상 갱신. 그 외엔 명시적으로 전달된 키만 갱신한다
  // (undefined 는 무시, null 은 의도된 값).
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.status !== undefined) update.status = patch.status;
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.output !== undefined) update.output = patch.output;
  if (patch.examId !== undefined) update.exam_id = patch.examId;
  if (patch.error !== undefined) update.error = patch.error;
  if (patch.lastResponseId !== undefined) {
    update.last_response_id = patch.lastResponseId;
  }
  if (patch.pendingToolCalls !== undefined) {
    update.pending_tool_calls = patch.pendingToolCalls;
  }
  if (patch.cancelRequested !== undefined) {
    update.cancel_requested = patch.cancelRequested;
  }
  if (patch.tokensUsed !== undefined) update.tokens_used = patch.tokensUsed;
  if (patch.costUsdMicros !== undefined) {
    update.cost_usd_micros = patch.costUsdMicros;
  }
  if (patch.completedAt !== undefined) update.completed_at = patch.completedAt;

  const { data, error } = await getSupabaseServer()
    .from(TABLE)
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`patchAgentRun failed: ${error.message}`);
  return mapRowToAgentRunRecord(data as AgentRunRow);
}

// ── stuck-run sweeper ────────────────────────────────────────────────────
/** sweepStaleAgentRuns 가 박는 error 메시지 (한국어, UI 노출용). */
const STALE_SWEEP_ERROR =
  "에이전트 작업이 시간 초과로 중단되었습니다. 다시 시도해 주세요.";

/**
 * 타임아웃으로 status 가 running/queued 에 영구히 박힌 런을 failed 로 정리한다.
 *
 * Vercel 함수가 에이전트 루프 도중 타임아웃으로 강제 종료되면 그 run 행은
 * 후처리(patchAgentRun)를 못 한 채 running 으로 남는다. cron 잡이 이 함수를
 * 주기적으로 호출해 정리한다.
 *
 * 원자성: 반드시 단일 조건부 UPDATE 로만 정리한다. SELECT 후 별도 UPDATE 를
 * 하면, 그 사이에 러너가 정상적으로 run 을 completed / waiting_approval 로
 * 끝낸 경우 그 결과를 failed 로 덮어쓰는 race 가 생긴다. WHERE 절에
 * `status IN ("running","queued") AND updated_at < cutoff` 를 박은 단일
 * UPDATE 라면, 그 사이 끝난 run 은 status 가 바뀌어 WHERE 에 더 이상 걸리지
 * 않으므로 절대 건드리지 않는다 (DB 가 행 단위로 원자성을 보장).
 *
 * @param cutoffIso 이 시각보다 updated_at 이 오래된 run 만 대상. ISO 8601.
 * @returns 이번 호출로 실제 정리된 run 목록 (cron 의 로깅/카운트용).
 */
export async function sweepStaleAgentRuns(
  cutoffIso: string
): Promise<AgentRunRecord[]> {
  const now = new Date().toISOString();

  const { data, error } = await getSupabaseServer()
    .from(TABLE)
    .update({
      status: "failed",
      error: STALE_SWEEP_ERROR,
      completed_at: now,
      updated_at: now,
    })
    .in("status", ["running", "queued"])
    .lt("updated_at", cutoffIso)
    .select();

  if (error) throw new Error(`sweepStaleAgentRuns failed: ${error.message}`);
  return (data ?? []).map((r) => mapRowToAgentRunRecord(r as AgentRunRow));
}
