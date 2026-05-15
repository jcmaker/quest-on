// Node.js Runtime 사용
export const runtime = "nodejs";

import { NextRequest } from "next/server";

import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateRequest } from "@/lib/validations";
import { logError } from "@/lib/logger";
import { createExam } from "@/app/api/supa/handlers/exam-handlers";

import { approveAgentRunSchema } from "@/lib/agent/validation";
import { getAgentRun, appendAgentStep, patchAgentRun } from "@/lib/agent/store";

import type { AgentRun, ExamDraftPayload } from "@/lib/agent/types";
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

/** createExam 에 넘길 6자리 시험 코드 생성 (충돌 시 createExam 이 자체 재생성). */
function generateExamCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const QUESTION_TYPES = ["multiple-choice", "essay", "short-answer"] as const;
type SupportedQuestionType = (typeof QUESTION_TYPES)[number];

/** DraftQuestion.type 은 자유 문자열 — createExam 의 enum 으로 정규화한다. */
function normalizeQuestionType(type: string): SupportedQuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(type)
    ? (type as SupportedQuestionType)
    : "essay";
}

/**
 * ExamDraftPayload → createExam 입력 매핑.
 * - DraftQuestion → 문제 객체 (type 정규화 + 문제별 rubric 보존). createExam 은
 *   questions 객체를 그대로 exams.questions JSON 에 저장하고, 채점은
 *   lib/grading-helpers.ts 의 resolveQuestionRubric 이 문제별 rubric 을 1순위로 읽는다.
 * - 시험 레벨 rubric 은 문제별 rubric 의 합집합(evaluationArea 기준 중복 제거)으로 채운다.
 *   autoGradeSession 이 exam.rubric 이 비어있지 않은지 게이트로 검사하기 때문.
 * - difficulty 는 exams 스키마에 자리가 없어 커밋 시 보존되지 않는다(생성 입력값).
 * - language 는 그대로 전달, status 는 "draft".
 */
function buildCreateExamInput(draft: ExamDraftPayload) {
  const now = new Date().toISOString();

  // 문제별 rubric 을 보존한 채로 매핑한다.
  const questions = draft.questions.map((q) => ({
    id: q.id,
    text: q.text,
    type: normalizeQuestionType(q.type),
    rubric: q.rubric ?? [],
  }));

  // 시험 레벨 rubric — 문제별 rubric 의 합집합(evaluationArea 기준 중복 제거).
  const seen = new Set<string>();
  const rubric: { evaluationArea: string; detailedCriteria: string }[] = [];
  for (const q of draft.questions) {
    for (const item of q.rubric ?? []) {
      if (seen.has(item.evaluationArea)) continue;
      seen.add(item.evaluationArea);
      rubric.push({
        evaluationArea: item.evaluationArea,
        detailedCriteria: item.detailedCriteria,
      });
    }
  }

  return {
    title: draft.title,
    code: generateExamCode(),
    duration: draft.durationMinutes,
    questions,
    rubric,
    status: "draft",
    language: draft.language,
    created_at: now,
    updated_at: now,
  };
}

/**
 * POST /api/agent/runs/[id]/approve
 *
 * 강사가 draft 를 승인한다. (editedDraft 가 있으면 그것을, 없으면 run.output 을 커밋)
 * createExam 으로 실제 exams row 를 생성하고 런을 completed 로 마무리한다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 2. Auth — createExam 도 내부에서 currentUser()/instructor 체크를 수행하지만,
    //    라우트 차원에서 먼저 막아 불필요한 작업을 줄인다.
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Instructor access required", 403);
    }

    // 1. Rate limit
    const rl = await checkRateLimitAsync(
      `agent-run-approve:${user.id}`,
      RATE_LIMITS.examControl
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
    const validation = validateRequest(approveAgentRunSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error!, 400);
    }
    const { editedDraft } = validation.data;

    // 4. Ownership — 미존재 / 타 소유 모두 404.
    const run = await getAgentRun(id);
    if (!run || run.actorId !== user.id) {
      return errorJson("NOT_FOUND", "Agent run not found", 404);
    }

    // 상태 체크 — 승인은 waiting_approval 상태에서만 허용.
    if (run.status !== "waiting_approval") {
      return errorJson(
        "CONFLICT",
        `Run is '${run.status}', not awaiting approval`,
        409,
        { status: run.status }
      );
    }

    // 커밋할 draft 결정: 강사가 검토 중 직접 수정했다면 editedDraft 우선.
    const draft: ExamDraftPayload | null = editedDraft ?? run.output;
    if (!draft) {
      return errorJson(
        "INVALID_STATE",
        "No exam draft available to approve",
        409
      );
    }

    // 5. Business logic — createExam 으로 실제 exams row 생성.
    //    createExam 은 성공/실패 모두 NextResponse 를 반환하므로 body 를 파싱한다.
    const examResponse = await createExam(buildCreateExamInput(draft));
    const examResult = (await examResponse.json()) as {
      success?: boolean;
      exam?: { id?: string };
      error?: string;
      message?: string;
    };

    if (
      !examResponse.ok ||
      examResult.success !== true ||
      !examResult.exam?.id
    ) {
      logError("createExam failed during agent run approval", examResult, {
        path: "/api/agent/runs/[id]/approve",
        additionalData: { runId: id },
      });
      return errorJson(
        "EXAM_CREATE_FAILED",
        examResult.message ?? "Failed to create exam from draft",
        examResponse.status >= 400 ? examResponse.status : 500
      );
    }

    const examId = examResult.exam.id;
    const completedAt = new Date().toISOString();

    // 런을 completed 로 마무리.
    const completedRun = await patchAgentRun(id, {
      status: "completed",
      examId,
      completedAt,
    });

    // 감사 스텝 — 승인 이벤트와 최종 커밋 결과.
    await appendAgentStep(id, {
      stepType: "approval",
      title: "강사 승인",
      content: editedDraft
        ? "강사가 draft 를 수정 후 승인했습니다."
        : "강사가 draft 를 승인했습니다.",
      metadata: {
        approvedBy: user.id,
        approvedAt: completedAt,
        edited: Boolean(editedDraft),
      },
    });
    const finalRun = await appendAgentStep(id, {
      stepType: "final",
      title: "시험 생성 완료",
      content: `시험이 생성되었습니다. (examId: ${examId})`,
      metadata: { examId },
    });

    void completedRun;
    return successJson({ run: toPublicRun(finalRun) });
  } catch (error) {
    logError("Failed to approve agent run", error, {
      path: "/api/agent/runs/[id]/approve",
    });
    return errorJson(
      "INTERNAL_ERROR",
      "에이전트 런 승인 처리 중 오류가 발생했습니다.",
      500,
      process.env.NODE_ENV === "development"
        ? error instanceof Error
          ? error.message
          : String(error)
        : undefined
    );
  }
}
