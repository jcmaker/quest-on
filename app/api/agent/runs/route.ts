// Node.js Runtime 사용
export const runtime = "nodejs";

// 한 턴 = 한 HTTP 요청 = LLM 1회 호출. after() 백그라운드 루프는 폐기됐다.
// 턴당 LLM 호출 1회면 충분하므로 maxDuration 을 60s 로 줄인다.
export const maxDuration = 60;

import { NextRequest } from "next/server";

import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateRequest } from "@/lib/validations";
import { logError } from "@/lib/logger";

import { startAgentRunSchema } from "@/lib/agent/validation";
import { createAgentRun, listAgentRuns, appendAgentStep } from "@/lib/agent/store";
import { advanceAgentRun } from "@/lib/agent/runner";

import type { AgentRun } from "@/lib/agent/types";
import type { AgentRunRecord } from "@/lib/agent/store";

/** 러너 내부 필드를 제거하고 공개 AgentRun 형태만 노출한다. */
function toPublicRun(record: AgentRunRecord): AgentRun {
  const {
    lastResponseId: _lastResponseId,
    pendingToolCalls: _pendingToolCalls,
    cancelRequested: _cancelRequested,
    ...publicRun
  } = record;
  void _lastResponseId;
  void _pendingToolCalls;
  void _cancelRequested;
  return publicRun;
}

/**
 * POST /api/agent/runs
 *
 * 재개형 클라이언트-인터랙티브 루프를 시작한다.
 * 런 생성 → user_input 스텝(첫 pageState 를 metadata 에 동봉) → advanceAgentRun
 * 첫 턴을 동기로 실행하고 AgentTurnResponse 를 반환한다. 클라이언트는 응답의
 * pendingActions 를 편집기에서 실행한 뒤 action-result 로 루프를 재개한다.
 */
export async function POST(request: NextRequest) {
  try {
    // 2. Auth
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Instructor access required", 403);
    }

    // 1. Rate limit (AI 엔드포인트 — 비용 보호)
    const rl = await checkRateLimitAsync(`agent-runs:${user.id}`, RATE_LIMITS.ai);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    // 3. Input validation
    const body = await request.json().catch(() => null);
    if (body === null) {
      return errorJson("VALIDATION_ERROR", "Invalid JSON body", 400);
    }
    const validation = validateRequest(startAgentRunSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error!, 400);
    }
    const { prompt, pageState } = validation.data;

    // 5. Business logic — 런 생성 → user_input 스텝 → 첫 턴 진행.
    //    AgentRunType 은 현재 "exam_creation" 단일값이므로 그것으로 고정한다.
    const run = await createAgentRun({
      type: "exam_creation",
      actorId: user.id,
      actorRole: "teacher",
      input: {
        prompt,
        // 첫 pageState 의 route 를 pageContext 로 보존(목록/감사용).
        pageContext: { route: pageState.route },
      },
    });

    // 첫 턴 러너는 continuation 이 없어 pageState 를 따로 얻어야 한다.
    // user_input 스텝 metadata 에 첫 pageState 를 심어 러너가 읽게 한다.
    await appendAgentStep(run.id, {
      stepType: "user_input",
      title: "강사 요청",
      content: prompt,
      metadata: { pageState },
    });

    // 6. 첫 턴을 동기로 실행 (턴당 LLM 1회 — after() 없음).
    const turn = await advanceAgentRun(run.id);

    // 7. Return — AgentTurnResponse.
    return successJson({
      run: turn.run,
      pendingActions: turn.pendingActions,
      done: turn.done,
      ...(turn.summary !== undefined ? { summary: turn.summary } : {}),
    });
  } catch (error) {
    logError("Failed to create agent run", error, { path: "/api/agent/runs" });
    return errorJson(
      "INTERNAL_ERROR",
      "에이전트 실행 중 오류가 발생했습니다. 다시 시도해주세요.",
      500,
      process.env.NODE_ENV === "development"
        ? error instanceof Error
          ? error.message
          : String(error)
        : undefined
    );
  }
}

/**
 * GET /api/agent/runs
 *
 * 강사 본인의 exam_creation 런 목록을 최신순으로 반환한다.
 */
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Instructor access required", 403);
    }

    const rl = await checkRateLimitAsync(
      `agent-runs-list:${user.id}`,
      RATE_LIMITS.general
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const runs = await listAgentRuns(user.id, {
      type: "exam_creation",
      limit: 20,
    });

    return successJson({ runs: runs.map(toPublicRun) });
  } catch (error) {
    logError("Failed to list agent runs", error, { path: "/api/agent/runs" });
    return errorJson("INTERNAL_ERROR", "에이전트 목록을 불러오지 못했습니다.", 500);
  }
}
