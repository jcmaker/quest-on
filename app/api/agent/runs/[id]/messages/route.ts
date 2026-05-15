// Node.js Runtime 사용
export const runtime = "nodejs";

// 수정(revision) 턴의 에이전트 루프도 응답 후 after() 백그라운드로 돈다.
// after 작업 시간을 확보하기 위해 maxDuration 을 길게 유지한다.
export const maxDuration = 300;

import { NextRequest, after } from "next/server";

import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateRequest } from "@/lib/validations";
import { logError } from "@/lib/logger";

import { agentRunMessageSchema } from "@/lib/agent/validation";
import { getAgentRun, appendAgentStep, patchAgentRun } from "@/lib/agent/store";
import { runAgentTurn } from "@/lib/agent/runner";

import type { AgentRun } from "@/lib/agent/types";
import type { AgentRunRecord } from "@/lib/agent/store";

/** 러너 내부 필드를 제거하고 공개 AgentRun 형태만 노출한다. */
function toPublicRun(record: AgentRunRecord): AgentRun {
  const {
    lastResponseId: _lastResponseId,
    pendingToolCalls: _pendingToolCalls,
    ...publicRun
  } = record;
  void _lastResponseId;
  void _pendingToolCalls;
  return publicRun;
}

/**
 * POST /api/agent/runs/[id]/messages
 *
 * waiting_approval 상태의 런에 강사가 수정 요청을 보낸다.
 * user_input 스텝을 추가하고 run 을 queued 로 되돌린 뒤, 에이전트 루프는
 * after() 로 응답 후 백그라운드에서 한 턴 더 돌린다. 응답은 status="queued"
 * 런을 즉시 반환하므로 UI 가 곧바로 폴링을 시작할 수 있다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Instructor access required", 403);
    }

    const rl = await checkRateLimitAsync(
      `agent-run-message:${user.id}`,
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
    const validation = validateRequest(agentRunMessageSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error!, 400);
    }
    const { prompt } = validation.data;

    // 4. Ownership — 미존재 / 타 소유 모두 404.
    const run = await getAgentRun(id);
    if (!run || run.actorId !== user.id) {
      return errorJson("NOT_FOUND", "Agent run not found", 404);
    }

    // 상태 체크 — 수정 요청은 승인 대기 중인 런에만 허용.
    if (run.status !== "waiting_approval") {
      return errorJson(
        "CONFLICT",
        `Run is '${run.status}', not awaiting approval`,
        409,
        { status: run.status }
      );
    }

    // 5. Business logic — user_input 스텝 추가 후 revision 턴을 백그라운드 예약.
    await appendAgentStep(id, {
      stepType: "user_input",
      title: "강사 수정 요청",
      content: prompt,
    });

    // run 을 queued 로 되돌려 UI 가 폴링을 시작하게 하고,
    // 이전 턴에 남았을 수 있는 취소 플래그를 리셋한다.
    const queuedRun = await patchAgentRun(id, {
      status: "queued",
      cancelRequested: false,
    });

    // 수정 턴 에이전트 루프는 응답 후 백그라운드에서 실행한다(await 하지 않음).
    after(() => runAgentTurn(id));

    return successJson({ run: toPublicRun(queuedRun) });
  } catch (error) {
    logError("Failed to send agent run message", error, {
      path: "/api/agent/runs/[id]/messages",
    });
    return errorJson(
      "INTERNAL_ERROR",
      "에이전트 수정 요청 처리 중 오류가 발생했습니다.",
      500,
      process.env.NODE_ENV === "development"
        ? error instanceof Error
          ? error.message
          : String(error)
        : undefined
    );
  }
}
