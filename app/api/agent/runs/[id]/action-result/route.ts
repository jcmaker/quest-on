// Node.js Runtime 사용
export const runtime = "nodejs";

// 한 턴 = 한 HTTP 요청 = LLM 1회 호출. after() 백그라운드 루프는 폐기됐다.
export const maxDuration = 60;

import { NextRequest } from "next/server";

import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateRequest } from "@/lib/validations";
import { logError } from "@/lib/logger";

import { agentActionResultSchema } from "@/lib/agent/validation";
import { getAgentRun } from "@/lib/agent/store";
import { advanceAgentRun } from "@/lib/agent/runner";

/**
 * POST /api/agent/runs/[id]/action-result
 *
 * 클라이언트가 직전 턴의 UI 액션 배치 실행 결과 + 실행 후 페이지 상태를
 * 보고하고 에이전트 루프를 한 턴 재개한다. advanceAgentRun 이 last_response_id
 * 를 previous_response_id 로, 액션 결과를 function_call_output 으로 동봉해
 * LLM 을 재호출하고 다음 AgentTurnResponse 를 만든다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const rl = await checkRateLimitAsync(
      `agent-run-action-result:${user.id}`,
      RATE_LIMITS.ai
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const { id } = await params;
    const invalidId = validateUUID(id, "id");
    if (invalidId) return invalidId;

    // 3. Input validation
    const body = await request.json().catch(() => null);
    if (body === null) {
      return errorJson("VALIDATION_ERROR", "Invalid JSON body", 400);
    }
    const validation = validateRequest(agentActionResultSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error!, 400);
    }
    const { results, pageState } = validation.data;

    // 4. Ownership — 미존재 / 타 소유 모두 404.
    const run = await getAgentRun(id);
    if (!run || run.actorId !== user.id) {
      return errorJson("NOT_FOUND", "Agent run not found", 404);
    }

    // 상태 체크 — 재개는 진행 중(running)인 런에만 의미가 있다.
    if (run.status !== "running") {
      return errorJson(
        "CONFLICT",
        `Run is '${run.status}', not in progress`,
        409,
        { status: run.status }
      );
    }

    // 5. Business logic — 액션 결과 + 새 pageState 로 한 턴 재개.
    const turn = await advanceAgentRun(id, { results, pageState });

    // 7. Return — AgentTurnResponse.
    return successJson({
      run: turn.run,
      pendingActions: turn.pendingActions,
      done: turn.done,
      ...(turn.summary !== undefined ? { summary: turn.summary } : {}),
    });
  } catch (error) {
    logError("Failed to process agent action result", error, {
      path: "/api/agent/runs/[id]/action-result",
    });
    return errorJson(
      "INTERNAL_ERROR",
      "에이전트 루프 재개 중 오류가 발생했습니다. 다시 시도해주세요.",
      500,
      process.env.NODE_ENV === "development"
        ? error instanceof Error
          ? error.message
          : String(error)
        : undefined
    );
  }
}
