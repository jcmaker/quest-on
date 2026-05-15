// Node.js Runtime 사용
export const runtime = "nodejs";

import { NextRequest } from "next/server";

import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

import { getAgentRun } from "@/lib/agent/store";

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
 * GET /api/agent/runs/[id]
 *
 * 단건 런 조회. 소유권 불일치 시 404 (존재 사실을 숨긴다).
 */
export async function GET(
  _request: NextRequest,
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
      `agent-run-get:${user.id}`,
      RATE_LIMITS.general
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const { id } = await params;
    const invalidId = validateUUID(id, "id");
    if (invalidId) return invalidId;

    const run = await getAgentRun(id);
    // 4. Ownership — 미존재 / 타 소유 모두 404 로 통일.
    if (!run || run.actorId !== user.id) {
      return errorJson("NOT_FOUND", "Agent run not found", 404);
    }

    return successJson({ run: toPublicRun(run) });
  } catch (error) {
    logError("Failed to get agent run", error, { path: "/api/agent/runs/[id]" });
    return errorJson("INTERNAL_ERROR", "에이전트 런을 불러오지 못했습니다.", 500);
  }
}
