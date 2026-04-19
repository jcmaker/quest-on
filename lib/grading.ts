import { z } from "zod";
import { getOpenAI, AI_MODEL_HEAVY } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  buildUnifiedGradingSystemPrompt,
  buildUnifiedGradingUserPrompt,
  buildSummaryGenerationSystemPrompt,
  buildAssignmentGradingPrompt,
} from "@/lib/prompts";
import { logError } from "@/lib/logger";
import {
  decompressSubmissions,
  decompressMessages,
  normalizeQuestions,
  buildRubricText,
  calculateWeightedScore,
  analyzeAiDependency,
  formatAiDependencyForPrompt,
  summarizeAiDependencyAssessments,
  resolveQuestionRubric,
  type DecompressionWarning,
} from "@/lib/grading-helpers";
import {
  buildAiTextMetadata,
  callTrackedChatCompletion,
} from "@/lib/ai-tracking";
import { sanitizeUserInput } from "@/lib/sanitize";
import { upsertGradesBySessionQuestion } from "@/lib/grades-upsert";
import type {
  StageGrading,
  SummaryData,
  QuestionSummaryData,
  AiDependencyAssessment,
  GradingProgress,
  GradingProgressStatus,
} from "@/lib/types/grading";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Merges a patch into sessions.grading_progress atomically in JS.
 * Best-effort — failures are logged but do not abort grading.
 */
async function updateGradingProgress(
  supabase: SupabaseClient,
  sessionId: string,
  patch: Partial<GradingProgress>
): Promise<void> {
  try {
    const { data: current, error: readErr } = await supabase
      .from("sessions")
      .select("grading_progress")
      .eq("id", sessionId)
      .maybeSingle();

    if (readErr) {
      logError("[AUTO_GRADE] Failed to read grading_progress", readErr, {
        path: "lib/grading.ts",
        additionalData: { sessionId },
      });
      return;
    }

    const existing = (current?.grading_progress as GradingProgress | null) || {
      status: "queued" as GradingProgressStatus,
      total: 0,
      completed: 0,
      failed: 0,
      updated_at: new Date().toISOString(),
    };

    const merged: GradingProgress = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase
      .from("sessions")
      .update({ grading_progress: merged })
      .eq("id", sessionId);

    if (updateErr) {
      logError("[AUTO_GRADE] Failed to update grading_progress", updateErr, {
        path: "lib/grading.ts",
        additionalData: { sessionId, patch },
      });
    }
  } catch (err) {
    logError("[AUTO_GRADE] Unexpected error in updateGradingProgress", err, {
      path: "lib/grading.ts",
      additionalData: { sessionId, patch },
    });
  }
}

/** Maximum time for the entire grading operation (240 seconds — must fit within Vercel maxDuration=300s with room for summary) */
const GRADING_TIMEOUT_MS = 240_000;

interface GradeResult {
  q_idx: number;
  score: number; // 0-100
  comment: string;
  stage_grading?: StageGrading;
  ai_summary?: QuestionSummaryData | null;
}

interface FailedGradeResult {
  q_idx: number;
  failureReason: string;
}

interface AutoGradeResult {
  grades: GradeResult[];
  summary: SummaryData | null;
  failedQuestions: number[];
  timedOut: boolean;
  decompressionWarnings?: DecompressionWarning[];
}

/** P0-4: Sanitize AI-generated comment to plain text (server-safe, no jsdom). */
function sanitizeComment(comment: string): string {
  if (!comment) return "";
  return sanitizeUserInput(comment).slice(0, 10000);
}

/** Clamp a score to [0, 100] and log if clamping occurred */
function clampAndLog(
  score: number,
  context: { sessionId: string; qIdx: number; field: string }
): { value: number; clamped: boolean } {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const wasClamped = clamped !== Math.round(score);
  if (wasClamped) {
    logError("[AUTO_GRADE] Score clamped to 0-100 range", null, {
      path: "lib/grading.ts",
      additionalData: {
        sessionId: context.sessionId,
        qIdx: context.qIdx,
        field: context.field,
        originalScore: score,
        clampedScore: clamped,
      },
    });
  }
  return { value: clamped, clamped: wasClamped };
}

type GradeSingleQuestionOutcome =
  | { ok: true; result: GradeResult; aiDependency: AiDependencyAssessment | null }
  | { ok: false; failureReason: string };

/**
 * 단일 문제 채점 (기존 pLimit 내부 closure 로직 추출)
 */
async function gradeSingleQuestion(params: {
  question: { idx: number; prompt?: string; ai_context?: string };
  submission: { answer: string; workspace_state?: unknown } | undefined;
  questionMessages: Array<{ role: string; content: string }>;
  exam: { id: string; title: string; rubric?: unknown; chat_weight?: number; type?: string; language?: string };
  rubricItems: ReturnType<typeof resolveQuestionRubric>;
  chatWeight: number;
  isAssignment: boolean;
  examLanguage: "ko" | "en";
  sessionId: string;
  studentId: string;
  signal: AbortSignal;
}): Promise<GradeSingleQuestionOutcome> {
  const {
    question,
    submission,
    questionMessages,
    exam,
    rubricItems,
    chatWeight,
    isAssignment,
    examLanguage,
    sessionId,
    studentId,
    signal,
  } = params;

  const qIdx = question.idx;
  const rubricText = buildRubricText(rubricItems);
  const rubricScoresSchema = rubricItems
    .map(
      (item) =>
        `  "${item.evaluationArea}": 0-5 사이의 정수 (0: 전혀 충족하지 않음, 5: 완벽하게 충족)`
    )
    .join(",\n");

  if (!submission) {
    return { ok: false, failureReason: "No submission for question" };
  }

  const aiDependencyAssessment = analyzeAiDependency({
    messages: questionMessages,
    finalAnswer: submission.answer || "",
  });

  // Build prompts: assignment uses dedicated grading prompt, exam uses unified grading
  let systemPrompt: string;
  let userPrompt: string;

  if (isAssignment) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ws = submission.workspace_state as any;
    const wsCode = typeof ws?.code === "string" ? ws.code : "";
    const wsErd = ws?.erd as
      | {
          nodes?: Array<{
            data: {
              tableName: string;
              columns: Array<{
                name: string;
                type: string;
                isPrimary?: boolean;
                isForeignKey?: boolean;
                references?: string;
              }>;
            };
          }>;
          edges?: Array<{ source: string; target: string; type?: string }>;
        }
      | undefined;
    const hasWorkspace = !!(wsCode.trim() || (wsErd?.nodes?.length ?? 0) > 0);

    systemPrompt = buildAssignmentGradingPrompt({
      examTitle: exam.title,
      assignmentPrompt: question.prompt || null,
      rubricText,
      workspaceContext: hasWorkspace
        ? {
            code: wsCode || undefined,
            language: typeof ws?.language === "string" ? ws.language : undefined,
            erd: wsErd?.nodes?.length
              ? { nodes: wsErd.nodes, edges: wsErd.edges || [] }
              : undefined,
          }
        : null,
      language: examLanguage,
    });

    const aiSummaryText = aiDependencyAssessment.summary
      ? `\n\n[AI 활용 요약]\n${aiDependencyAssessment.summary}`
      : "";

    userPrompt = `[학생이 작성한 문서]\n${submission.answer || "(문서 없음)"}${aiSummaryText}`;
  } else {
    systemPrompt = buildUnifiedGradingSystemPrompt({
      rubricText,
      rubricScoresSchema,
      chatWeightPercent: chatWeight,
      language: examLanguage,
    });

    userPrompt = buildUnifiedGradingUserPrompt({
      questionPrompt: question.prompt || "",
      questionAiContext: question.ai_context,
      answer: submission.answer || "",
      aiDependencyAssessment,
    });
  }

  // Retry loop: up to 2 retries (3 total attempts) with exponential backoff (1s, 2s)
  const MAX_GRADING_RETRIES = 2;
  const RETRY_DELAYS_MS = [1_000, 2_000];

  let rawParsed: unknown = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_GRADING_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
      logError(
        `[AUTO_GRADE] Retrying grading API call (attempt ${attempt + 1}/${MAX_GRADING_RETRIES + 1})`,
        null,
        {
          path: "lib/grading.ts",
          additionalData: { sessionId, qIdx, attempt },
        }
      );
    }
    try {
      const tracked = await callTrackedChatCompletion(
        () =>
          getOpenAI().chat.completions.create(
            {
              model: AI_MODEL_HEAVY,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              response_format: { type: "json_object" },
            },
            { signal }
          ),
        {
          feature: "auto_grading_question",
          route: "lib/grading.ts",
          model: AI_MODEL_HEAVY,
          userId: studentId,
          examId: exam.id,
          sessionId,
          qIdx,
          metadata: buildAiTextMetadata({
            inputText: [systemPrompt, userPrompt],
            extra: {
              chat_weight: chatWeight,
              rubric_item_count: rubricItems.length,
              message_count: questionMessages.length,
              attempt,
            },
          }),
        },
        {
          timeoutMs: 90_000,
          metadataBuilder: (result) =>
            buildAiTextMetadata({
              outputText:
                (result as { choices?: Array<{ message?: { content?: string | null } }> })
                  .choices?.[0]?.message?.content ?? null,
            }),
        }
      );
      const c = tracked.data;
      if (!c.choices?.length) {
        throw new Error("Empty AI response (no choices)");
      }
      rawParsed = JSON.parse(c.choices[0]?.message?.content || "{}");
      break; // success
    } catch (err) {
      lastError = err;
      if (attempt === MAX_GRADING_RETRIES) {
        logError(
          `[AUTO_GRADE] All ${MAX_GRADING_RETRIES + 1} grading attempts failed`,
          err,
          {
            path: "lib/grading.ts",
            additionalData: { sessionId, qIdx },
          }
        );
        return {
          ok: false,
          failureReason: `API failed after ${MAX_GRADING_RETRIES + 1} attempts: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      logError(`[AUTO_GRADE] Grading attempt ${attempt + 1} failed, will retry`, err, {
        path: "lib/grading.ts",
        additionalData: { sessionId, qIdx, attempt },
      });
    }
  }

  if (rawParsed === null) {
    return {
      ok: false,
      failureReason: `Grading failed: ${lastError instanceof Error ? lastError.message : "unknown"}`,
    };
  }

  // Zod schema for AI grading response
  const aiGradingResponseSchema = z.object({
    chat_score: z.number().finite().optional(),
    chat_comment: z.string().optional(),
    answer_score: z.number().finite().optional(),
    answer_comment: z.string().optional(),
    overall_comment: z.string().optional(),
    rubric_scores: z.record(z.string(), z.number().finite().min(0).max(5)).optional(),
  });

  // Assignment grading path
  if (isAssignment) {
    const assignmentResponseSchema = z.object({
      rubric_scores: z
        .array(
          z.object({
            area: z.string(),
            score: z.number().finite().min(0).max(100),
            comment: z.string(),
          })
        )
        .optional(),
      overall_score: z.number().finite().min(0).max(100),
      overall_comment: z.string(),
    });

    const assignmentResult = assignmentResponseSchema.safeParse(rawParsed);
    if (!assignmentResult.success) {
      logError("[AUTO_GRADE] Assignment response schema validation failed", assignmentResult.error, {
        path: "lib/grading.ts",
        additionalData: { sessionId, qIdx, rawContent: JSON.stringify(rawParsed).slice(0, 500) },
      });
      return { ok: false, failureReason: "Assignment schema validation failure" };
    }

    const assignmentParsed = assignmentResult.data;
    const scoreClamp = clampAndLog(assignmentParsed.overall_score, {
      sessionId,
      qIdx,
      field: "overall_score",
    });

    const assignmentRubricScores: Record<string, number> = {};
    if (assignmentParsed.rubric_scores) {
      for (const rs of assignmentParsed.rubric_scores) {
        assignmentRubricScores[rs.area] = Math.max(0, Math.min(100, Math.round(rs.score)));
      }
    }

    const stageGrading: StageGrading = {
      answer: {
        score: scoreClamp.value,
        comment: sanitizeComment(assignmentParsed.overall_comment || "과제 평가 완료"),
        rubric_scores:
          Object.keys(assignmentRubricScores).length > 0 ? assignmentRubricScores : undefined,
      },
    };

    return {
      ok: true,
      aiDependency: null,
      result: {
        q_idx: qIdx,
        score: scoreClamp.value,
        comment: sanitizeComment(assignmentParsed.overall_comment || "과제 평가 완료"),
        stage_grading: scoreClamp.clamped
          ? { ...stageGrading, _score_clamped: true }
          : stageGrading,
      },
    };
  }

  // Exam grading path
  const schemaResult = aiGradingResponseSchema.safeParse(rawParsed);
  if (!schemaResult.success) {
    logError("[AUTO_GRADE] AI response schema validation failed", schemaResult.error, {
      path: "lib/grading.ts",
      additionalData: { sessionId, qIdx, rawContent: JSON.stringify(rawParsed).slice(0, 500) },
    });
    return { ok: false, failureReason: "Schema validation failure" };
  }
  const parsed = schemaResult.data;

  const hasChatScore =
    typeof parsed.chat_score === "number" && Number.isFinite(parsed.chat_score);
  const hasAnswerScore =
    typeof parsed.answer_score === "number" && Number.isFinite(parsed.answer_score);
  if (!hasChatScore && !hasAnswerScore) {
    logError("[AUTO_GRADE] AI returned no valid scores — rejecting to prevent 0-score grade", null, {
      path: "lib/grading.ts",
      additionalData: { sessionId, qIdx, rawContent: JSON.stringify(rawParsed).slice(0, 500) },
    });
    return { ok: false, failureReason: "No valid scores in AI response" };
  }

  const rubricScores: Record<string, number> = {};
  if (parsed.rubric_scores && typeof parsed.rubric_scores === "object" && rubricItems.length > 0) {
    const rawRubricScores = parsed.rubric_scores;
    const normalizedRubric: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawRubricScores)) {
      if (typeof k === "string") normalizedRubric[k.trim().toLowerCase()] = v as number;
    }
    rubricItems.forEach((item) => {
      const normalizedKey = item.evaluationArea.trim().toLowerCase();
      const score = normalizedRubric[normalizedKey];
      if (typeof score === "number" && Number.isFinite(score)) {
        rubricScores[item.evaluationArea] = Math.max(0, Math.min(5, Math.round(score)));
      }
    });
  }
  const rubricScoresOrUndef = Object.keys(rubricScores).length > 0 ? rubricScores : undefined;

  const stageGrading: StageGrading = {};
  let scoreClamped = false;

  if (questionMessages.length > 0 && hasChatScore) {
    const chatClamp = clampAndLog(parsed.chat_score ?? 0, { sessionId, qIdx, field: "chat_score" });
    scoreClamped = scoreClamped || chatClamp.clamped;
    const adjustedChatScore = Math.max(
      0,
      Math.min(100, chatClamp.value - aiDependencyAssessment.penaltyApplied)
    );
    stageGrading.chat = {
      score: adjustedChatScore,
      comment: sanitizeComment(
        `${parsed.chat_comment || "채팅 단계 평가 완료"}\n\nAI 활용 해석: ${aiDependencyAssessment.summary}`
      ),
      rubric_scores: rubricScoresOrUndef,
      ai_dependency: aiDependencyAssessment,
    };
  }

  if (submission.answer?.trim() && hasAnswerScore) {
    const answerClamp = clampAndLog(parsed.answer_score ?? 0, {
      sessionId,
      qIdx,
      field: "answer_score",
    });
    scoreClamped = scoreClamped || answerClamp.clamped;
    stageGrading.answer = {
      score: answerClamp.value,
      comment: sanitizeComment(parsed.answer_comment || "답안 평가 완료"),
      rubric_scores: rubricScoresOrUndef,
    };
  }

  const finalScore = calculateWeightedScore(stageGrading, chatWeight);
  const overallComment = sanitizeComment(
    parsed.overall_comment ||
      `채팅 단계: ${stageGrading.chat?.score ?? "N/A"}점, 답안 단계: ${stageGrading.answer?.score ?? "N/A"}점`
  );

  if (Object.keys(stageGrading).length === 0) {
    return { ok: false, failureReason: "No stage_grading produced" };
  }

  return {
    ok: true,
    aiDependency: aiDependencyAssessment,
    result: {
      q_idx: qIdx,
      score: finalScore,
      comment: overallComment,
      stage_grading: scoreClamped ? { ...stageGrading, _score_clamped: true } : stageGrading,
    },
  };
}

/**
 * 문제별 종합평가 생성 — grades.ai_summary 컬럼에 저장.
 * 기존 buildSummaryEvaluationSystemPrompt를 재활용하되, 단일 문제로 스코프 좁힘.
 */
async function generateQuestionSummary(params: {
  question: { idx: number; prompt?: string; ai_context?: string };
  submission: { answer: string } | undefined;
  questionMessages: Array<{ role: string; content: string }>;
  grade: GradeResult;
  rubricItems: ReturnType<typeof resolveQuestionRubric>;
  examTitle: string;
  examId: string;
  examLanguage: "ko" | "en";
  sessionId: string;
  studentId: string;
  signal: AbortSignal;
  timeoutMs: number;
}): Promise<QuestionSummaryData | null> {
  const {
    question,
    submission,
    questionMessages,
    grade,
    rubricItems,
    examTitle,
    examId,
    examLanguage,
    sessionId,
    studentId,
    signal,
    timeoutMs,
  } = params;

  try {
    const rubricText =
      rubricItems.length > 0
        ? `\n[평가 루브릭]\n${rubricItems
            .map(
              (item, index) =>
                `${index + 1}. ${item.evaluationArea}\n   - 세부 기준: ${item.detailedCriteria}`
            )
            .join("\n")}\n`
        : "";

    const chatHistoryText =
      questionMessages.length > 0
        ? `\n\n**학생과 AI의 대화 기록:**\n${questionMessages
            .map((msg) => `${msg.role === "user" ? "학생" : "AI"}: ${msg.content}`)
            .join("\n\n")}`
        : "";

    const aiDependencyText = grade.stage_grading?.chat?.ai_dependency
      ? `\nAI 활용/의존 신호:\n${formatAiDependencyForPrompt(grade.stage_grading.chat.ai_dependency)}`
      : "";

    const stageInfoText = [
      grade.stage_grading?.chat ? `채팅 단계 점수: ${grade.stage_grading.chat.score}점` : "",
      grade.stage_grading?.answer ? `답안 단계 점수: ${grade.stage_grading.answer.score}점` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const systemPrompt = buildSummaryGenerationSystemPrompt(examLanguage);

    const userPrompt = `
시험 제목: ${examTitle}
${rubricText}
문제 ${question.idx + 1}: ${question.prompt || ""}

학생 답안:
${submission?.answer || "답안 없음"}
${chatHistoryText}

점수: ${grade.score}점
${stageInfoText}

위 문제에 대한 학생의 수행을 상세하게 분석하여 요약 평가해주세요.
다음 항목을 반드시 포함해야 합니다:
1. 전체적인 평가 (긍정적/부정적/중립적)
2. 종합 의견: 답안과 대화의 논리성, 정확성, 이해도를 종합적으로 분석.
3. 주요 강점 (3가지 이내): 구체적인 예시를 들어 설명하세요.
4. 개선이 필요한 점 (3가지 이내): 구체적인 개선 방안과 함께 제시하세요.
5. 핵심 인용구 (2가지): 평가에 결정적인 영향을 미친 문장을 원문 그대로 인용하세요.

JSON 형식으로 응답해주세요:
{
  "sentiment": "positive" | "negative" | "neutral",
  "summary": "상세한 종합 의견 텍스트",
  "strengths": ["강점1", "강점2", ...],
  "weaknesses": ["개선점1", "개선점2", ...],
  "keyQuotes": ["인용구1", "인용구2"]
}
`;

    const tracked = await callTrackedChatCompletion(
      () =>
        getOpenAI().chat.completions.create(
          {
            model: AI_MODEL_HEAVY,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
            seed: deriveSessionSeed(sessionId),
          },
          { signal }
        ),
      {
        feature: "auto_grading_question_summary",
        route: "lib/grading.ts",
        model: AI_MODEL_HEAVY,
        userId: studentId,
        examId,
        sessionId,
        qIdx: question.idx,
        metadata: buildAiTextMetadata({
          inputText: [systemPrompt, userPrompt],
          extra: { rubric_item_count: rubricItems.length, message_count: questionMessages.length },
        }),
      },
      {
        timeoutMs,
        metadataBuilder: (result) =>
          buildAiTextMetadata({
            outputText:
              (result as { choices?: Array<{ message?: { content?: string | null } }> })
                .choices?.[0]?.message?.content ?? null,
          }),
      }
    );

    const completion = tracked.data;

    const questionSummarySchema = z.object({
      sentiment: z.enum(["positive", "negative", "neutral"]),
      summary: z.string(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      keyQuotes: z.array(z.string()).optional(),
    });

    let rawSummary: unknown;
    try {
      rawSummary = JSON.parse(completion.choices[0]?.message?.content || "{}");
    } catch (parseErr) {
      logError("[AUTO_GRADE] Failed to parse per-question summary JSON", parseErr, {
        path: "lib/grading.ts",
        additionalData: {
          sessionId,
          qIdx: question.idx,
          rawContent: (completion.choices[0]?.message?.content ?? "(empty)").slice(0, 500),
        },
      });
      return null;
    }

    const validation = questionSummarySchema.safeParse(rawSummary);
    if (!validation.success) {
      logError("[AUTO_GRADE] Per-question summary schema validation failed", validation.error, {
        path: "lib/grading.ts",
        additionalData: {
          sessionId,
          qIdx: question.idx,
          rawContent: JSON.stringify(rawSummary).slice(0, 500),
        },
      });
      return null;
    }

    return validation.data;
  } catch (err) {
    logError("[AUTO_GRADE] generateQuestionSummary failed", err, {
      path: "lib/grading.ts",
      additionalData: { sessionId, qIdx: question.idx },
    });
    return null;
  }
}

/**
 * 서버 사이드 자동 채점 함수 — 순차 처리 (각 문제마다 채점 → 문제별 종합평가 → grades 저장 반복).
 * 전체 루프에 outer timeout (240s) 적용.
 */
export async function autoGradeSession(
  sessionId: string,
  options?: { signal?: AbortSignal }
): Promise<AutoGradeResult> {
  const requestStartTime = Date.now();
  const supabase = getSupabaseServer();
  const abortController = new AbortController();
  if (options?.signal) {
    options.signal.addEventListener("abort", () => abortController.abort(), { once: true });
  }

  // 1. 세션 정보
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, exam_id, student_id")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // 2. 시험 정보
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, title, questions, rubric, chat_weight, type, language")
    .eq("id", session.exam_id)
    .single();

  if (examError || !exam) {
    throw new Error(`Exam not found for session: ${sessionId}`);
  }

  // 3. 제출 답안
  const { data: submissions, error: submissionsError } = await supabase
    .from("submissions")
    .select(
      `
      id,
      q_idx,
      answer,
      compressed_answer_data,
      workspace_state,
      created_at
    `
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (submissionsError) {
    throw new Error(`Failed to fetch submissions: ${submissionsError.message}`);
  }

  // 4. 메시지
  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select(
      `
      id,
      q_idx,
      role,
      content,
      compressed_content,
      created_at
    `
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (messagesError) {
    logError("[AUTO_GRADE] Error fetching messages", messagesError, {
      path: "lib/grading.ts",
      additionalData: { sessionId },
    });
  }

  if (messages && messages.length > 200) {
    logError("[AUTO_GRADE] Large session detected — high message count", null, {
      path: "lib/grading.ts",
      additionalData: { sessionId, messageCount: messages.length },
    });
  }

  // 5. 압축 해제
  const decompressionWarnings: DecompressionWarning[] = [];
  const submissionsByQuestion = decompressSubmissions(submissions || [], decompressionWarnings);
  const messagesByQuestion = decompressMessages(messages || [], decompressionWarnings);

  // 6. 문제 정규화
  const questions = normalizeQuestions(exam.questions);
  const chatWeight = Math.max(0, Math.min(100, exam.chat_weight ?? 50));
  const isAssignment = exam.type === "assignment";
  const examLanguage: "ko" | "en" = exam.language === "en" ? "en" : "ko";

  const questionsToGrade = isAssignment
    ? questions.filter((q) => q.idx === 0)
    : questions;

  // 7. 순차 처리 루프 — 각 문제마다: 채점 → 문제별 요약 → grades 저장
  const grades: GradeResult[] = [];
  const failedGradeResults: FailedGradeResult[] = [];
  const failedQuestions: number[] = [];
  let timedOut = false;

  // 채점 루프 내에서 시간 초과 감시
  const deadline = requestStartTime + GRADING_TIMEOUT_MS;

  // Progress tracking — counts only questions that actually entered the grading loop
  // (i.e. had a submission). Matches `grades.length + failedQuestions.length` at the end.
  let progressTotal = 0;
  for (const q of questionsToGrade) {
    if (submissionsByQuestion[q.idx]) progressTotal++;
  }
  let completedCount = 0;
  let failedCount = 0;
  await updateGradingProgress(supabase, sessionId, {
    status: "running",
    total: progressTotal,
    completed: 0,
    failed: 0,
  });

  for (const question of questionsToGrade) {
    const qIdx = question.idx;

    // Deadline check — stop processing further questions
    if (Date.now() >= deadline) {
      timedOut = true;
      abortController.abort();
      logError("[AUTO_GRADE] Deadline reached — stopping further questions", null, {
        path: "lib/grading.ts",
        additionalData: { sessionId, remainingFromIdx: qIdx },
      });
      // Remaining unprocessed questions → failed
      const submission = submissionsByQuestion[qIdx];
      if (submission) {
        failedGradeResults.push({ q_idx: qIdx, failureReason: "Timed out before processing" });
        failedQuestions.push(qIdx);
        failedCount++;
        await updateGradingProgress(supabase, sessionId, {
          completed: completedCount,
          failed: failedCount,
        });
      }
      continue;
    }

    // Resolve rubric for this question
    const rubricItems = resolveQuestionRubric(question, exam.rubric);
    if (
      rubricItems.length === 1 &&
      rubricItems[0].evaluationArea === "전반적 답변 품질"
    ) {
      logError(
        "[AUTO_GRADE] Using default rubric — no rubric configured for question or exam",
        null,
        {
          path: "lib/grading.ts",
          additionalData: { sessionId, qIdx, examId: exam.id },
        }
      );
    }

    const submission = submissionsByQuestion[qIdx];
    const questionMessages = messagesByQuestion[qIdx] || [];

    if (!submission) {
      // No submission — skip (don't mark as failure)
      continue;
    }

    // 7-1. 채점
    const gradeOutcome = await gradeSingleQuestion({
      question,
      submission,
      questionMessages,
      exam,
      rubricItems,
      chatWeight,
      isAssignment,
      examLanguage,
      sessionId,
      studentId: session.student_id,
      signal: abortController.signal,
    });

    if (!gradeOutcome.ok) {
      failedGradeResults.push({ q_idx: qIdx, failureReason: gradeOutcome.failureReason });
      failedQuestions.push(qIdx);
      failedCount++;
      await updateGradingProgress(supabase, sessionId, {
        completed: completedCount,
        failed: failedCount,
      });
      continue;
    }

    const grade = gradeOutcome.result;

    // 7-2. 문제별 종합평가 — 남은 시간 예산 내에서만 시도
    const QUESTION_SUMMARY_MIN_MS = 10_000;
    const QUESTION_SUMMARY_MAX_MS = 60_000;
    const remainingMs = deadline - Date.now();
    let questionSummary: QuestionSummaryData | null = null;

    if (remainingMs > QUESTION_SUMMARY_MIN_MS) {
      const summaryTimeout = Math.min(QUESTION_SUMMARY_MAX_MS, Math.max(QUESTION_SUMMARY_MIN_MS, remainingMs - 5_000));
      questionSummary = await generateQuestionSummary({
        question,
        submission,
        questionMessages,
        grade,
        rubricItems,
        examTitle: exam.title,
        examId: exam.id,
        examLanguage,
        sessionId,
        studentId: session.student_id,
        signal: abortController.signal,
        timeoutMs: summaryTimeout,
      });
    } else {
      logError("[AUTO_GRADE] Skipping per-question summary — insufficient time budget", null, {
        path: "lib/grading.ts",
        additionalData: { sessionId, qIdx, remainingMs },
      });
    }

    grade.ai_summary = questionSummary;

    // 7-3. grades 저장 (per-question upsert)
    try {
      await upsertGradesBySessionQuestion(
        supabase as never,
        [
          {
            session_id: sessionId,
            q_idx: grade.q_idx,
            score: grade.score,
            comment: grade.comment,
            stage_grading: grade.stage_grading || null,
            ai_summary: grade.ai_summary || null,
            grade_type: "auto",
          },
        ],
        "auto_grade_sequential"
      );
    } catch (upsertErr) {
      logError("[AUTO_GRADE] Failed to upsert grade row", upsertErr, {
        path: "lib/grading.ts",
        additionalData: { sessionId, qIdx },
      });
      failedGradeResults.push({
        q_idx: qIdx,
        failureReason: `Grade upsert failed: ${upsertErr instanceof Error ? upsertErr.message : String(upsertErr)}`,
      });
      failedQuestions.push(qIdx);
      failedCount++;
      await updateGradingProgress(supabase, sessionId, {
        completed: completedCount,
        failed: failedCount,
      });
      continue;
    }

    grades.push(grade);
    completedCount++;
    await updateGradingProgress(supabase, sessionId, {
      completed: completedCount,
      failed: failedCount,
    });
  }

  // 8. Insert ai_failed grade records for failures
  if (failedGradeResults.length > 0) {
    const failedGradeRecords = failedGradeResults.map((failed) => ({
      session_id: sessionId,
      q_idx: failed.q_idx,
      score: 0,
      comment: `[AI 채점 실패] ${failed.failureReason} — 강사의 수동 채점이 필요합니다.`,
      stage_grading: null,
      ai_summary: null,
      grade_type: "ai_failed",
    }));

    try {
      await upsertGradesBySessionQuestion(
        supabase as never,
        failedGradeRecords,
        "auto_grade_failed_records"
      );
    } catch (failedInsertError) {
      logError("[AUTO_GRADE] Failed to insert ai_failed grade records", failedInsertError, {
        path: "lib/grading.ts",
        additionalData: {
          sessionId,
          failedQIdxes: failedGradeResults.map((f) => f.q_idx),
        },
      });
    }
  }

  // 9. 세션 레벨 종합평가 — 문제별 요약을 입력으로 받아 경량화
  const VERCEL_BUDGET_MS = 280_000;
  const MIN_SUMMARY_TIME_MS = 30_000;
  let summary: SummaryData | null = null;
  const elapsedMs = Date.now() - requestStartTime;
  const remainingMs = VERCEL_BUDGET_MS - elapsedMs;

  if (timedOut) {
    logError("[AUTO_GRADE] Skipping session summary — grading timed out", null, {
      path: "lib/grading.ts",
      additionalData: { sessionId, elapsedMs },
    });
  } else if (remainingMs < MIN_SUMMARY_TIME_MS) {
    logError("[AUTO_GRADE] Skipping session summary — insufficient time budget", null, {
      path: "lib/grading.ts",
      additionalData: { sessionId, elapsedMs, remainingMs },
    });
  } else {
    try {
      summary = await generateSummary(
        sessionId,
        session.student_id,
        exam,
        questions,
        submissionsByQuestion,
        grades,
        remainingMs
      );
    } catch (err) {
      logError("[AUTO_GRADE] Session summary generation failed", err, {
        path: "lib/grading.ts",
        additionalData: { sessionId },
      });
    }
  }

  // 10. Persist partial grading status on sessions
  const isPartial = timedOut || failedQuestions.length > 0;
  if (isPartial) {
    const gradingFailureDetails = failedGradeResults.reduce<Record<number, string>>(
      (acc, f) => {
        acc[f.q_idx] = f.failureReason;
        return acc;
      },
      {}
    );

    const gradingStatusPayload = {
      grading_status: "partial" as const,
      grading_failed_questions: failedQuestions,
      grading_completed_count: grades.length,
      grading_total_count: questions.length,
      grading_timed_out: timedOut,
      grading_failure_details: gradingFailureDetails,
    };
    const mergedSummary = { ...(summary || {}), ...gradingStatusPayload };
    const { error: statusError } = await supabase
      .from("sessions")
      .update({ ai_summary: mergedSummary })
      .eq("id", sessionId);

    if (statusError) {
      logError("[AUTO_GRADE] Failed to save partial grading status — retrying once", statusError, {
        path: "lib/grading.ts",
        additionalData: { sessionId, failedQuestions },
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const { error: retryStatusError } = await supabase
        .from("sessions")
        .update({ ai_summary: mergedSummary })
        .eq("id", sessionId);
      if (retryStatusError) {
        logError(
          "[AUTO_GRADE] Retry also failed for partial grading status update",
          retryStatusError,
          {
            path: "lib/grading.ts",
            additionalData: { sessionId, failedQuestions },
          }
        );
      }
    }
  }

  // 11. Finalize grading_progress status
  const finalStatus: GradingProgressStatus =
    timedOut || failedQuestions.length > 0 ? "failed" : "completed";
  await updateGradingProgress(supabase, sessionId, {
    status: finalStatus,
    completed: completedCount,
    failed: failedCount,
  });

  return {
    grades,
    summary,
    failedQuestions,
    timedOut,
    ...(decompressionWarnings.length > 0 && { decompressionWarnings }),
  };
}

/**
 * 세션 레벨 종합 요약 평가 생성 (sessions.ai_summary에 저장).
 * 입력은 grades[].ai_summary 를 기반으로 경량화됨 — 전체 채팅 기록을 재포함하지 않음.
 */
// Deterministic seed from sessionId — stabilizes summary draws across calls.
// Without seed, temperature 1.0 default caused re-grade to produce noticeably
// better/worse summaries from identical inputs (stochastic variance).
function deriveSessionSeed(sessionId: string): number {
  return Array.from(sessionId).reduce(
    (h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0,
    0
  );
}

async function generateSummary(
  sessionId: string,
  studentId: string,
  exam: { id: string; title: string; rubric?: unknown; language?: string },
  questions: Array<{ idx: number; prompt?: string; ai_context?: string }>,
  submissionsByQuestion: Record<number, { answer: string }>,
  grades: GradeResult[],
  timeBudgetMs?: number
): Promise<SummaryData | null> {
  const supabase = getSupabaseServer();
  const examLanguage: "ko" | "en" = exam.language === "en" ? "en" : "ko";
  try {
    const rubricText =
      exam.rubric && Array.isArray(exam.rubric) && exam.rubric.length > 0
        ? examLanguage === "en"
          ? `\n[Evaluation rubric]\n${(exam.rubric as Array<{ evaluationArea: string; detailedCriteria: string }>)
              .map((r) => `- ${r.evaluationArea}: ${r.detailedCriteria}`)
              .join("\n")}\n`
          : `\n[평가 루브릭]\n${(exam.rubric as Array<{ evaluationArea: string; detailedCriteria: string }>)
              .map((r, i) => `${i + 1}. ${r.evaluationArea}\n   - 세부 기준: ${r.detailedCriteria}`)
              .join("\n")}\n`
        : "";

    // Use actual answers (same as /api/instructor/generate-summary)
    const questionsText = questions
      .map((q) => {
        const qIdx = q.idx;
        const submission = submissionsByQuestion[qIdx];
        const grade = grades.find((g) => g.q_idx === qIdx);
        const answer = submission?.answer || (examLanguage === "en" ? "No answer" : "답안 없음");
        const scoreText = grade ? (examLanguage === "en" ? `Score: ${grade.score}` : `점수: ${grade.score}점`) : "";

        return examLanguage === "en"
          ? `Question ${qIdx + 1}: ${q.prompt || ""}\nStudent answer: ${answer}\n${scoreText}`
          : `문제 ${qIdx + 1}: ${q.prompt || ""}\n학생 답안: ${answer}\n${scoreText}`;
      })
      .join("\n\n");

    const systemPrompt = buildSummaryGenerationSystemPrompt(examLanguage);

    const userPrompt =
      examLanguage === "en"
        ? `
Exam title: ${exam.title}
${rubricText}
[Student's answers]
${questionsText}

Based on the content above, analyze the student's overall performance in depth and produce a summary evaluation.
You must include all of the following:
1. Overall sentiment (positive / negative / neutral)
2. Comprehensive opinion: an in-depth analysis of the student's answers as a whole. Consider logical coherence, accuracy, and creativity together.
3. Key strengths (up to 3): illustrate each with specific examples.
4. Areas for improvement (up to 3): present each with a concrete improvement suggestion.
5. Key quotes (exactly 2): pick two sentences or phrases from the student's answers that most decisively influenced the evaluation.

Respond in JSON:
{
  "sentiment": "positive" | "negative" | "neutral",
  "summary": "detailed comprehensive opinion text",
  "strengths": ["strength 1", "strength 2", ...],
  "weaknesses": ["weakness 1", "weakness 2", ...],
  "keyQuotes": ["quote 1", "quote 2"]
}`
        : `
시험 제목: ${exam.title}
${rubricText}
[학생의 답안]
${questionsText}

위 내용을 바탕으로 학생의 전체적인 수행 능력을 상세하게 분석하여 요약 평가해주세요.
다음 항목을 반드시 포함해야 합니다:
1. 전체적인 평가 (긍정적/부정적/중립적)
2. 종합 의견: 학생의 답안 전반에 대한 깊이 있는 분석. 논리성, 정확성, 창의성 등을 종합적으로 고려하세요.
3. 주요 강점 (3가지 이내): 구체적인 예시를 들어 설명하세요.
4. 개선이 필요한 점 (3가지 이내): 구체적인 개선 방안과 함께 제시하세요.
5. 핵심 인용구 (2가지): 학생의 답안 중 평가에 결정적인 영향을 미친 문장이나 구절을 원문 그대로 인용하세요.

JSON 형식으로 응답해주세요:
{
  "sentiment": "positive" | "negative" | "neutral",
  "summary": "상세한 종합 의견 텍스트",
  "strengths": ["강점1", "강점2", ...],
  "weaknesses": ["약점1", "약점2", ...],
  "keyQuotes": ["인용구1", "인용구2"]
}`;

    const tracked = await callTrackedChatCompletion(
      () =>
        getOpenAI().chat.completions.create({
          model: AI_MODEL_HEAVY,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
          seed: deriveSessionSeed(sessionId),
        }),
      {
        feature: "auto_grading_summary",
        route: "lib/grading.ts",
        model: AI_MODEL_HEAVY,
        userId: studentId,
        examId: exam.id,
        sessionId,
        metadata: buildAiTextMetadata({
          inputText: [systemPrompt, userPrompt],
          extra: {
            graded_question_count: grades.length,
          },
        }),
      },
      {
        timeoutMs: (() => {
          const SUMMARY_MIN_TIMEOUT_MS = 60_000;
          const SUMMARY_MAX_TIMEOUT_MS = 120_000;
          if (!timeBudgetMs) return SUMMARY_MAX_TIMEOUT_MS;
          return Math.max(
            SUMMARY_MIN_TIMEOUT_MS,
            Math.min(timeBudgetMs - 5_000, SUMMARY_MAX_TIMEOUT_MS)
          );
        })(),
        metadataBuilder: (result) =>
          buildAiTextMetadata({
            outputText:
              (result as { choices?: Array<{ message?: { content?: string | null } }> })
                .choices?.[0]?.message?.content ?? null,
          }),
      }
    );
    const completion = tracked.data;

    const summaryResponseSchema = z.object({
      sentiment: z.enum(["positive", "negative", "neutral"]),
      summary: z.string(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      keyQuotes: z.array(z.string()).optional(),
    });

    let rawSummary: unknown;
    try {
      rawSummary = JSON.parse(completion.choices[0]?.message?.content || "{}");
    } catch (parseErr) {
      const rawContent = completion.choices[0]?.message?.content ?? "(empty)";
      logError("[AUTO_GRADE] Failed to parse summary JSON response", parseErr, {
        path: "lib/grading.ts",
        additionalData: { sessionId, rawContent: rawContent.slice(0, 500) },
      });
      return null;
    }

    const summaryValidation = summaryResponseSchema.safeParse(rawSummary);
    if (!summaryValidation.success) {
      logError("[AUTO_GRADE] Summary response schema validation failed", summaryValidation.error, {
        path: "lib/grading.ts",
        additionalData: { sessionId, rawContent: JSON.stringify(rawSummary).slice(0, 500) },
      });
      return null;
    }
    const result: SummaryData = summaryValidation.data;

    const aiDependencySummary = summarizeAiDependencyAssessments(
      grades.map((grade) => ({
        q_idx: grade.q_idx,
        assessment: grade.stage_grading?.chat?.ai_dependency,
      }))
    );
    const summaryWithDependency: SummaryData = {
      ...result,
      aiDependency: aiDependencySummary,
    };

    const { error: updateError } = await supabase
      .from("sessions")
      .update({ ai_summary: summaryWithDependency })
      .eq("id", sessionId);

    if (updateError) {
      logError("[AUTO_GRADE] Error saving summary to database — retrying once", updateError, {
        path: "lib/grading.ts",
        additionalData: { sessionId },
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const { error: retryUpdateError } = await supabase
        .from("sessions")
        .update({ ai_summary: summaryWithDependency })
        .eq("id", sessionId);
      if (retryUpdateError) {
        logError("[AUTO_GRADE] Retry also failed for summary save", retryUpdateError, {
          path: "lib/grading.ts",
          additionalData: { sessionId },
        });
      }
    }

    return summaryWithDependency;
  } catch (err) {
    logError("[AUTO_GRADE] Summary generation failed in generateSummary", err, {
      path: "lib/grading.ts",
      additionalData: { sessionId },
    });
    return null;
  }
}
