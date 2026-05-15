/**
 * 강사 AI 에이전트 — 타입드 fetch 클라이언트
 *
 * /api/agent/* 5개 엔드포인트의 클라이언트 래퍼.
 * 타입 계약은 lib/agent/types.ts 가 단일 진실원이다.
 *
 * 응답 봉투: lib/api-response.ts 의 successJson 은 `{ success: true, ...data }`,
 * errorJson 은 `{ error, message, details? }` 형태로 직렬화한다.
 * 따라서 단건 응답은 `{ success, run }`, 목록 응답은 `{ success, runs }` 가 된다.
 *
 * 주의: 이 엔드포인트들은 아직 서버에 존재하지 않을 수 있다 (정상).
 * 클라이언트는 계약에 맞춰 호출만 정의한다.
 */

import type {
  AgentRun,
  AgentRunListResponse,
  AgentRunMessageRequest,
  AgentRunResponse,
  ApproveAgentRunRequest,
  CreateAgentRunRequest,
} from "@/lib/agent/types";

/** errorJson 봉투 형태 */
interface ApiErrorEnvelope {
  error?: string;
  message?: string;
  details?: unknown;
}

/**
 * 공통 fetch 헬퍼 — 응답 봉투를 언랩하고 에러를 throw 한다.
 * successJson 은 data 를 최상위로 스프레드하므로 봉투에서 직접 필드를 꺼낸다.
 */
async function agentFetch<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  // 본문 파싱 (비어 있을 수 있음)
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const err = (body ?? {}) as ApiErrorEnvelope;
    throw new Error(
      err.message || err.error || `에이전트 요청 실패 (${res.status})`
    );
  }

  return body as T;
}

/** POST /api/agent/runs — 새 런 생성 */
export async function createAgentRun(
  req: CreateAgentRunRequest
): Promise<AgentRun> {
  const data = await agentFetch<AgentRunResponse>("/api/agent/runs", {
    method: "POST",
    body: JSON.stringify(req),
  });
  return data.run;
}

/** GET /api/agent/runs/[id] — 단일 런 조회 (폴링용) */
export async function getAgentRun(id: string): Promise<AgentRun> {
  const data = await agentFetch<AgentRunResponse>(
    `/api/agent/runs/${encodeURIComponent(id)}`
  );
  return data.run;
}

/** GET /api/agent/runs — 런 목록 조회 */
export async function listAgentRuns(): Promise<AgentRun[]> {
  const data = await agentFetch<AgentRunListResponse>("/api/agent/runs");
  return data.runs;
}

/** POST /api/agent/runs/[id]/messages — waiting_approval 상태에서 수정 요청 */
export async function sendAgentRunMessage(
  id: string,
  req: AgentRunMessageRequest
): Promise<AgentRun> {
  const data = await agentFetch<AgentRunResponse>(
    `/api/agent/runs/${encodeURIComponent(id)}/messages`,
    {
      method: "POST",
      body: JSON.stringify(req),
    }
  );
  return data.run;
}

/** POST /api/agent/runs/[id]/approve — draft 승인 후 시험 커밋 */
export async function approveAgentRun(
  id: string,
  req: ApproveAgentRunRequest
): Promise<AgentRun> {
  const data = await agentFetch<AgentRunResponse>(
    `/api/agent/runs/${encodeURIComponent(id)}/approve`,
    {
      method: "POST",
      body: JSON.stringify(req),
    }
  );
  return data.run;
}

/**
 * POST /api/agent/runs/[id]/cancel — 진행 중(running/queued)인 런 중단 요청.
 * 협조적 취소: 플래그만 세우고, 러너가 다음 체크포인트에서 멈춰 status 를
 * "cancelled" 로 바꾼다. 호출 직후 응답의 status 는 아직 바뀌지 않았을 수 있다.
 */
export async function cancelAgentRun(id: string): Promise<AgentRun> {
  const data = await agentFetch<AgentRunResponse>(
    `/api/agent/runs/${encodeURIComponent(id)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
  return data.run;
}
