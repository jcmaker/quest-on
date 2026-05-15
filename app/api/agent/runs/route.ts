// Node.js Runtime 사용
export const runtime = "nodejs";

// 에이전트 루프는 응답 후 after() 백그라운드 작업으로 돈다.
// after 작업 시간을 확보하기 위해 maxDuration 을 길게 유지한다.
export const maxDuration = 300;

import { NextRequest, after } from "next/server";

import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateRequest } from "@/lib/validations";
import { logError } from "@/lib/logger";

import { createAgentRunSchema } from "@/lib/agent/validation";
import {
  createAgentRun,
  listAgentRuns,
  appendAgentStep,
} from "@/lib/agent/store";
import { runAgentTurn } from "@/lib/agent/runner";

import type { AgentRun } from "@/lib/agent/types";
import type { AgentRunRecord } from "@/lib/agent/store";

/**
 * 러너 내부 필드(lastResponseId, pendingToolCalls)를 제거하고
 * types.ts 의 공개 AgentRun 형태만 노출한다.
 */
function toPublicRun(record: AgentRunRecord): AgentRun {
  const {
    // 내부 필드 — 응답에서 제외
    lastResponseId: _lastResponseId,
    pendingToolCalls: _pendingToolCalls,
    ...publicRun
  } = record;
  void _lastResponseId;
  void _pendingToolCalls;
  return publicRun;
}

/**
 * POST /api/agent/runs
 *
 * 강사의 새 에이전트 런을 생성한다. 런 생성 + user_input 스텝 추가까지만
 * await 하고, 에이전트 루프(runAgentTurn)는 after() 로 응답 후 백그라운드에서
 * 실행한다. 응답은 status="queued" 인 런을 즉시 반환하므로 UI 가 곧바로
 * 폴링을 시작할 수 있다.
 */
export async function POST(request: NextRequest) {
  try {
    // 2. Auth — rate limit 키를 만들려면 user 가 필요하므로 먼저 인증한다.
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
    const validation = validateRequest(createAgentRunSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error!, 400);
    }
    const { type, prompt, pageContext } = validation.data;

    // 5. Business logic — 런 생성 → user_input 스텝 → 에이전트 루프
    const run = await createAgentRun({
      type,
      actorId: user.id,
      actorRole: "teacher",
      input: { prompt, pageContext },
    });

    const queuedRun = await appendAgentStep(run.id, {
      stepType: "user_input",
      title: "강사 요청",
      content: prompt,
    });

    // 에이전트 루프는 응답 후 백그라운드에서 실행한다(await 하지 않음).
    // 러너가 즉시 status 를 running 으로 바꾸고 스텝을 실시간 적재한다.
    after(() => runAgentTurn(run.id));

    // 7. Return — status="queued" 런을 즉시 반환. 내부 러너 필드는 노출하지 않는다.
    return successJson({ run: toPublicRun(queuedRun) });
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
