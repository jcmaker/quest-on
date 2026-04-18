import { z } from "zod";
import pLimit from "p-limit";
import { getOpenAI, AI_MODEL_HEAVY } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  buildUnifiedGradingSystemPrompt,
  buildUnifiedGradingUserPrompt,
  buildSummaryEvaluationSystemPrompt,
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
} from "@/lib/types/grading";

/** Maximum time for the entire grading operation (240 seconds — must fit within Vercel maxDuration=300s with room for summary) */
const GRADING_TIMEOUT_MS = 240_000;

interface GradeResult {
  q_idx: number;
  score: number; // 0-100
  comment: string;
  stage_grading?: StageGrading;
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

/**
 * 서버 사이드 자동 채점 함수
 * 루브릭 기반으로 각 문제를 0-100점으로 채점
 * Outer timeout (90s) 적용 — 시간 초과 시 완료된 채점만 저장
 */
export async function autoGradeSession(
  sessionId: string,
  options?: { signal?: AbortSignal }
): Promise<AutoGradeResult> {
  // P1-3: Track request start time for Vercel maxDuration budget calculation
  const requestStartTime = Date.now();
  const supabase = getSupabaseServer();
  const abortController = new AbortController();
  // If caller provides an external signal, forward its abort
  if (options?.signal) {
    options.signal.addEventListener("abort", () => abortController.abort(), { once: true });
  }
  // 1. 세션 정보 가져오기
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, exam_id, student_id")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // 2. 시험 정보 가져오기 (루브릭 포함)
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, title, questions, rubric, chat_weight, type, language")
    .eq("id", session.exam_id)
    .single();

  if (examError || !exam) {
    throw new Error(`Exam not found for session: ${sessionId}`);
  }

  // 3. 제출 답안 가져오기
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
    .order("created_at", { ascending: false }); // 최신 것부터 정렬

  if (submissionsError) {
    throw new Error(`Failed to fetch submissions: ${submissionsError.message}`);
  }

  if (!submissions || submissions.length === 0) {
    // submissions가 없어도 계속 진행 (메시지만으로 채점 가능할 수 있음)
  }

  // 4. 메시지 가져오기 (채팅 기록)
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
    // messages는 필수가 아니므로 에러를 throw하지 않음
    logError("[AUTO_GRADE] Error fetching messages", messagesError, {
      path: "lib/grading.ts",
      additionalData: { sessionId },
    });
  }

  // P1-3: Log large sessions for monitoring (grading needs all messages, no limit applied)
  if (messages && messages.length > 200) {
    logError("[AUTO_GRADE] Large session detected — high message count", null, {
      path: "lib/grading.ts",
      additionalData: { sessionId, messageCount: messages.length },
    });
  }

  // 5. 데이터 압축 해제 및 정리 (헬퍼 함수 사용)
  const decompressionWarnings: DecompressionWarning[] = [];
  const submissionsByQuestion = decompressSubmissions(submissions || [], decompressionWarnings);
  const messagesByQuestion = decompressMessages(messages || [], decompressionWarnings);

  // 6. 문제 정규화
  const questions = normalizeQuestions(exam.questions);

  // 7-8. 각 문제별 채점 (병렬 처리로 ~5배 속도 개선)
  // 루브릭은 문제별로 resolveQuestionRubric을 사용하여 해결
  const chatWeight = Math.max(0, Math.min(100, exam.chat_weight ?? 50));

  const isAssignment = exam.type === "assignment";
  const examLanguage: "ko" | "en" = exam.language === "en" ? "en" : "ko";
  const failedGradeResults: FailedGradeResult[] = [];

  // For assignments, only grade q_idx=0 (single document)
  const questionsToGrade = isAssignment
    ? questions.filter((q) => q.idx === 0)
    : questions;

  // Limit per-session concurrency to avoid overwhelming the AI provider
  // when a single session has many questions (e.g., 20-question exam)
  const perSessionLimiter = pLimit(5);

  const gradePromises = questionsToGrade.map((question) => perSessionLimiter(async (): Promise<GradeResult | null> => {
    // Per-question rubric resolution (resolveQuestionRubric returns DEFAULT_RUBRIC when empty)
    const rubricItems = resolveQuestionRubric(question, exam.rubric);
    if (rubricItems.length === 1 && rubricItems[0].evaluationArea === "전반적 답변 품질") {
      logError("[AUTO_GRADE] Using default rubric — no rubric configured for question or exam", null, {
        path: "lib/grading.ts",
        additionalData: { sessionId, qIdx: question.idx, examId: exam.id },
      });
    }
    const rubricText = buildRubricText(rubricItems);
    const rubricScoresSchema = rubricItems
      .map(
        (item) =>
          `  "${item.evaluationArea}": 0-5 사이의 정수 (0: 전혀 충족하지 않음, 5: 완벽하게 충족)`
      )
      .join(",\n");
    const qIdx = question.idx;
    const submission = submissionsByQuestion[qIdx];
    // No fallback — if no submission matches question.idx, treat as unanswered
    const questionMessages = messagesByQuestion[qIdx] || [];
    const aiDependencyAssessment = analyzeAiDependency({
      messages: questionMessages,
      finalAnswer: submission?.answer || "",
    });

    if (!submission) {
      return null;
    }

    // Build prompts: assignment uses dedicated grading prompt, exam uses unified grading
    let systemPrompt: string;
    let userPrompt: string;

    if (isAssignment) {
      // Parse workspace_state for hybrid (Code + ERD) assignments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ws = submission.workspace_state as any;
      const wsCode = typeof ws?.code === "string" ? ws.code : "";
      const wsErd = ws?.erd as { nodes?: Array<{ data: { tableName: string; columns: Array<{ name: string; type: string; isPrimary?: boolean; isForeignKey?: boolean; references?: string }> } }>; edges?: Array<{ source: string; target: string; type?: string }> } | undefined;
      const hasWorkspace = !!(wsCode.trim() || (wsErd?.nodes?.length ?? 0) > 0);

      systemPrompt = buildAssignmentGradingPrompt({
        examTitle: exam.title,
        assignmentPrompt: question.prompt || null,
        rubricText,
        workspaceContext: hasWorkspace ? {
          code: wsCode || undefined,
          language: typeof ws?.language === "string" ? ws.language : undefined,
          erd: wsErd?.nodes?.length ? { nodes: wsErd.nodes, edges: wsErd.edges || [] } : undefined,
        } : null,
        language: examLanguage,
      });

      // Use ai_summary instead of raw chat history (token reduction + prompt injection prevention)
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
    // Covers API errors, empty responses, and JSON parse failures.
    const MAX_GRADING_RETRIES = 2;
    const RETRY_DELAYS_MS = [1_000, 2_000];

    let rawParsed: unknown = null;
    for (let attempt = 0; attempt <= MAX_GRADING_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
        logError(`[AUTO_GRADE] Retrying grading API call (attempt ${attempt + 1}/${MAX_GRADING_RETRIES + 1})`, null, {
          path: "lib/grading.ts",
          additionalData: { sessionId, qIdx, attempt },
        });
      }
      try {
        const tracked = await callTrackedChatCompletion(
          () =>
            getOpenAI().chat.completions.create({
              model: AI_MODEL_HEAVY,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              response_format: { type: "json_object" },
            }, { signal: abortController.signal }),
          {
            feature: "auto_grading_question",
            route: "lib/grading.ts",
            model: AI_MODEL_HEAVY,
            userId: session.student_id,
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
        break; // success — exit retry loop
      } catch (err) {
        if (attempt === MAX_GRADING_RETRIES) {
          logError(`[AUTO_GRADE] All ${MAX_GRADING_RETRIES + 1} grading attempts failed`, err, {
            path: "lib/grading.ts",
            additionalData: { sessionId, qIdx },
          });
          failedGradeResults.push({ q_idx: qIdx, failureReason: `API failed after ${MAX_GRADING_RETRIES + 1} attempts: ${err instanceof Error ? err.message : String(err)}` });
          return null;
        }
        logError(`[AUTO_GRADE] Grading attempt ${attempt + 1} failed, will retry`, err, {
          path: "lib/grading.ts",
          additionalData: { sessionId, qIdx, attempt },
        });
      }
    }

    // Zod schema for AI grading response — validates structure before trusting scores
    const aiGradingResponseSchema = z.object({
      chat_score: z.number().finite().optional(),
      chat_comment: z.string().optional(),
      answer_score: z.number().finite().optional(),
      answer_comment: z.string().optional(),
      overall_comment: z.string().optional(),
      rubric_scores: z.record(z.string(), z.number().finite().min(0).max(5)).optional(),
    });

    // Assignment grading: different response schema and scoring
    if (isAssignment) {
      const assignmentResponseSchema = z.object({
        rubric_scores: z.array(z.object({
          area: z.string(),
          score: z.number().finite().min(0).max(100),
          comment: z.string(),
        })).optional(),
        overall_score: z.number().finite().min(0).max(100),
        overall_comment: z.string(),
      });

      const assignmentResult = assignmentResponseSchema.safeParse(rawParsed);
      if (!assignmentResult.success) {
        logError("[AUTO_GRADE] Assignment response schema validation failed", assignmentResult.error, {
          path: "lib/grading.ts",
          additionalData: { sessionId, qIdx, rawContent: JSON.stringify(rawParsed).slice(0, 500) },
        });
        failedGradeResults.push({ q_idx: qIdx, failureReason: "Assignment schema validation failure" });
        return null;
      }

      const assignmentParsed = assignmentResult.data;
      const scoreClamp = clampAndLog(assignmentParsed.overall_score, { sessionId, qIdx, field: "overall_score" });

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
          rubric_scores: Object.keys(assignmentRubricScores).length > 0 ? assignmentRubricScores : undefined,
        },
      };

      return {
        q_idx: qIdx,
        score: scoreClamp.value,
        comment: sanitizeComment(assignmentParsed.overall_comment || "과제 평가 완료"),
        stage_grading: scoreClamp.clamped
          ? { ...stageGrading, _score_clamped: true }
          : stageGrading,
      };
    }

    // Exam grading: unified response schema
    const schemaResult = aiGradingResponseSchema.safeParse(rawParsed);
    if (!schemaResult.success) {
      logError("[AUTO_GRADE] AI response schema validation failed", schemaResult.error, {
        path: "lib/grading.ts",
        additionalData: { sessionId, qIdx, rawContent: JSON.stringify(rawParsed).slice(0, 500) },
      });
      failedGradeResults.push({ q_idx: qIdx, failureReason: "Schema validation failure" });
      return null;
    }
    const parsed = schemaResult.data;

    // P0-2: Reject empty/invalid responses — at least one score must be a finite number
    const hasChatScore = typeof parsed.chat_score === "number" && Number.isFinite(parsed.chat_score);
    const hasAnswerScore = typeof parsed.answer_score === "number" && Number.isFinite(parsed.answer_score);
    if (!hasChatScore && !hasAnswerScore) {
      logError("[AUTO_GRADE] AI returned no valid scores — rejecting to prevent 0-score grade", null, {
        path: "lib/grading.ts",
        additionalData: { sessionId, qIdx, rawContent: JSON.stringify(rawParsed).slice(0, 500) },
      });
      failedGradeResults.push({ q_idx: qIdx, failureReason: "No valid scores in AI response" });
      return null;
    }

    // Parse rubric_scores
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

    // Build StageGrading — populate both chat and answer for backward compat
    const stageGrading: StageGrading = {};

    let scoreClamped = false;

    if (questionMessages.length > 0 && hasChatScore) {
      const chatClamp = clampAndLog(parsed.chat_score ?? 0, { sessionId, qIdx, field: "chat_score" });
      scoreClamped = scoreClamped || chatClamp.clamped;
      const adjustedChatScore = Math.max(0, Math.min(100, chatClamp.value - aiDependencyAssessment.penaltyApplied));
      stageGrading.chat = {
        score: adjustedChatScore,
        comment: sanitizeComment(`${parsed.chat_comment || "채팅 단계 평가 완료"}\n\nAI 활용 해석: ${aiDependencyAssessment.summary}`),
        rubric_scores: rubricScoresOrUndef,
        ai_dependency: aiDependencyAssessment,
      };
    }

    if (submission.answer?.trim() && hasAnswerScore) {
      const answerClamp = clampAndLog(parsed.answer_score ?? 0, { sessionId, qIdx, field: "answer_score" });
      scoreClamped = scoreClamped || answerClamp.clamped;
      stageGrading.answer = {
        score: answerClamp.value,
        comment: sanitizeComment(parsed.answer_comment || "답안 평가 완료"),
        rubric_scores: rubricScoresOrUndef,
      };
    }

    // 종합 점수 계산 — 가중 평균 (0-100 범위 보장)
    const finalScore = calculateWeightedScore(stageGrading, chatWeight);
    const overallComment = sanitizeComment(
      parsed.overall_comment
      || `채팅 단계: ${stageGrading.chat?.score ?? "N/A"}점, 답안 단계: ${stageGrading.answer?.score ?? "N/A"}점`
    );

    if (Object.keys(stageGrading).length > 0) {
      const gradeResult: GradeResult = {
        q_idx: qIdx,
        score: finalScore,
        comment: overallComment,
        stage_grading: scoreClamped
          ? { ...stageGrading, _score_clamped: true }
          : stageGrading,
      };
      return gradeResult;
    }

    return null;
  }));

  // 모든 문제 병렬 채점 실행 (with outer timeout)
  // Track settlement of each promise so we can recover partial results on timeout
  // Pre-fill with default fulfilled(null) to avoid undefined access on timeout
  let gradingDone = false;
  const settled: Array<PromiseSettledResult<GradeResult | null>> =
    Array.from({ length: gradePromises.length }, () => ({ status: "fulfilled" as const, value: null }));
  gradePromises.forEach((p, i) => {
    p.then(
      (value) => { if (!gradingDone) settled[i] = { status: "fulfilled", value }; },
      (reason) => { if (!gradingDone) settled[i] = { status: "rejected", reason }; }
    );
  });

  const gradingPromise = Promise.allSettled(gradePromises);
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<"TIMEOUT">((resolve) => {
    timeoutId = setTimeout(() => resolve("TIMEOUT"), GRADING_TIMEOUT_MS);
  });

  const raceResult = await Promise.race([gradingPromise, timeoutPromise]);
  clearTimeout(timeoutId!);
  const timedOut = raceResult === "TIMEOUT";

  // Fix 3B: Set gradingDone and snapshot in the same synchronous block
  // to prevent TOCTOU race between .then() callbacks and timeout snapshot
  gradingDone = true;
  if (timedOut) {
    abortController.abort();
  }

  // On timeout, snapshot whatever results have settled so far (gradingDone prevents further mutations)
  const gradeResults: Array<PromiseSettledResult<GradeResult | null>> = timedOut
    ? [...settled]
    : raceResult;

  const grades: GradeResult[] = gradeResults
    .filter(
      (r): r is PromiseFulfilledResult<GradeResult | null> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value!);

  // Track failed and timed-out questions
  const failedQuestions: number[] = [];
  gradeResults.forEach((r, idx) => {
    if (r.status === "rejected") {
      const question = questionsToGrade[idx];
      const qIdx = question?.idx ?? idx;
      const reasonMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      failedQuestions.push(qIdx);
      failedGradeResults.push({ q_idx: qIdx, failureReason: reasonMsg });
      logError("[AUTO_GRADE] Question grading failed", r.reason, {
        path: "lib/grading.ts",
        additionalData: { sessionId, failureReason: reasonMsg },
      });
    } else if (r.status === "fulfilled" && r.value === null && timedOut) {
      // Question was null due to timeout (not because it had no submission)
      const question = questionsToGrade[idx];
      if (!question) return;
      const submission = submissionsByQuestion[question.idx];
      if (submission) {
        failedQuestions.push(question.idx);
        failedGradeResults.push({ q_idx: question.idx, failureReason: "Timed out" });
      }
    }
  });

  // Include AI parse/schema failures in failedQuestions
  for (const failed of failedGradeResults) {
    if (!failedQuestions.includes(failed.q_idx)) {
      failedQuestions.push(failed.q_idx);
    }
  }

  if (timedOut) {
    logError("[AUTO_GRADE] Grading timed out", new Error(`Grading timed out after ${GRADING_TIMEOUT_MS}ms`), {
      path: "lib/grading.ts",
      additionalData: { sessionId, completedCount: grades.length, totalQuestions: questions.length },
    });
  }

  // 9a. Insert ai_failed grade records for questions that failed grading
  if (failedGradeResults.length > 0) {
    const failedGradeRecords = failedGradeResults.map((failed) => ({
      session_id: sessionId,
      q_idx: failed.q_idx,
      score: 0,
      comment: `[AI 채점 실패] ${failed.failureReason} — 강사의 수동 채점이 필요합니다.`,
      stage_grading: null,
      grade_type: "ai_failed",
    }));

    try {
      await upsertGradesBySessionQuestion(supabase as never, failedGradeRecords, "auto_grade_failed_records");
    } catch (failedInsertError) {
      logError("[AUTO_GRADE] Failed to insert ai_failed grade records", failedInsertError, {
        path: "lib/grading.ts",
        additionalData: { sessionId, failedQIdxes: failedGradeResults.map((f) => f.q_idx) },
      });
    }
  }

  // 9b. 채점 결과 저장 (partial 결과라도 저장) + insert 반환값으로 직접 검증
  if (grades.length > 0) {
    const gradeRows = grades.map((grade) => ({
      session_id: sessionId,
      q_idx: grade.q_idx,
      score: grade.score,
      comment: grade.comment,
      stage_grading: grade.stage_grading || null,
      grade_type: "auto",
    }));
    const insertedQIdxs = await upsertGradesBySessionQuestion(
      supabase as never,
      gradeRows,
      "auto_grade_results"
    );

    // Verify via insert return — no separate SELECT needed
    const insertedQIdxSet = new Set(insertedQIdxs);
    for (const grade of grades) {
      if (!insertedQIdxSet.has(grade.q_idx)) {
        failedQuestions.push(grade.q_idx);
        logError("[AUTO_GRADE] Grade not returned after insert", new Error("Grade verification failed"), {
          path: "lib/grading.ts",
          additionalData: { sessionId, q_idx: grade.q_idx },
        });
      }
    }
  }

  // 10. 요약 평가 생성 (timeout 시에도 완료된 결과로 시도)
  // P1-3: Dynamic time budget — skip summary if insufficient time remains for Vercel maxDuration=300s
  const VERCEL_BUDGET_MS = 280_000; // Leave 20s safety margin from maxDuration=300s
  const MIN_SUMMARY_TIME_MS = 30_000; // Need at least 30s for summary generation
  let summary: SummaryData | null = null;
  const elapsedMs = Date.now() - requestStartTime;
  const remainingMs = VERCEL_BUDGET_MS - elapsedMs;

  if (timedOut) {
    logError("[AUTO_GRADE] Skipping summary — grading timed out", null, {
      path: "lib/grading.ts",
      additionalData: { sessionId, elapsedMs },
    });
  } else if (remainingMs < MIN_SUMMARY_TIME_MS) {
    logError("[AUTO_GRADE] Skipping summary — insufficient time budget", null, {
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
        messagesByQuestion,
        grades,
        remainingMs
      );
    } catch (err) {
      logError("[AUTO_GRADE] Summary generation failed", err, {
        path: "lib/grading.ts",
        additionalData: { sessionId },
      });
    }
  }

  // 11. Persist grading status in ai_summary so instructors can see partial grading
  const isPartial = timedOut || failedQuestions.length > 0;
  if (isPartial) {
    const gradingFailureDetails = failedGradeResults.reduce<Record<number, string>>(
      (acc, f) => { acc[f.q_idx] = f.failureReason; return acc; },
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
      // P0-3: Retry once after 1s — grades are already saved, so log-only on second failure
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const { error: retryStatusError } = await supabase
        .from("sessions")
        .update({ ai_summary: mergedSummary })
        .eq("id", sessionId);
      if (retryStatusError) {
        logError("[AUTO_GRADE] Retry also failed for partial grading status update", retryStatusError, {
          path: "lib/grading.ts",
          additionalData: { sessionId, failedQuestions },
        });
      }
    }
  }

  return {
    grades,
    summary,
    failedQuestions,
    timedOut,
    ...(decompressionWarnings.length > 0 && { decompressionWarnings }),
  };
}

/**
 * 종합 요약 평가 생성
 */
async function generateSummary(
  sessionId: string,
  studentId: string,
  exam: { id: string; title: string; rubric?: unknown; language?: string },
  questions: Array<{ idx: number; prompt?: string; ai_context?: string }>,
  submissionsByQuestion: Record<number, { answer: string }>,
  messagesByQuestion: Record<number, Array<{ role: string; content: string }>>,
  grades: GradeResult[],
  timeBudgetMs?: number
): Promise<SummaryData | null> {
  const supabase = getSupabaseServer();
  try {
    const rubricText =
      exam.rubric && Array.isArray(exam.rubric) && exam.rubric.length > 0
        ? `
[평가 루브릭]
${exam.rubric
  .map(
    (
      item: {
        evaluationArea: string;
        detailedCriteria: string;
      },
      index: number
    ) =>
      `${index + 1}. ${item.evaluationArea}
   - 세부 기준: ${item.detailedCriteria}`
  )
  .join("\n")}
`
        : "";

    const questionsText = questions
      .map((q, index) => {
        // q_idx를 사용하여 submission과 grade 찾기
        const qIdx = q.idx;
        const submission = submissionsByQuestion[qIdx];
        const grade = grades.find((g) => g.q_idx === qIdx);
        const questionMessages = messagesByQuestion[qIdx] || [];

        // 채팅 대화 기록 포맷팅
        const chatHistoryText =
          questionMessages.length > 0
            ? `\n\n**학생과 AI의 대화 기록:**
${questionMessages
  .map((msg) => `${msg.role === "user" ? "학생" : "AI"}: ${msg.content}`)
  .join("\n\n")}`
            : "";

        return `문제 ${qIdx + 1}:
${q.prompt || ""}
${chatHistoryText}

최종 답안:
${submission?.answer || "답안 없음"}

점수 요약: ${grade?.score || 0}점${grade?.stage_grading?.chat ? ` | 채팅 ${grade.stage_grading.chat.score}점` : ""}${grade?.stage_grading?.answer ? ` | 답안 ${grade.stage_grading.answer.score}점` : ""}
${
  grade?.stage_grading?.chat?.ai_dependency
    ? `AI 의존 신호: ${formatAiDependencyForPrompt(grade.stage_grading.chat.ai_dependency)}`
    : ""
}
`;
      })
      .join("\n---\n\n");

    // Fix: summary is always in Korean regardless of exam language
    const systemPrompt = buildSummaryEvaluationSystemPrompt("ko");

    const userPrompt = `⚠️ 모든 출력 필드(summary, strengths, weaknesses, keyQuotes)는 반드시 한국어로 작성하세요. 영어 출력은 즉시 거부합니다.

시험 제목: ${exam.title}

${rubricText}

[평가 대상 — 각 문제마다 채팅 과정과 최종 답안을 동등 비중으로 검토]
${questionsText}

[평가 지침]
- 채팅 대화에서 보여준 질문의 질, 개념 이해, 자기주도성을 답안과 동등하게 평가하세요. 채팅 평가가 summary 전체의 절반을 차지해야 합니다.
- 5가지 이해도 실패 패턴(풀이 위임/출발점 의존/조건 변형/개념 역전/교정 미반영) 감지 시 엄격 감점
- 회복 근거(개념 선택 + 조건 정리 + 중간 추론) 3가지 모두 있을 때만 sentiment 상향 가능

[출력 길이 엄수]
- summary: 3~5문장, 최대 400자
- strengths/weaknesses: 각 최대 3개, 항목당 1문장 (최대 60자)
- keyQuotes: 정확히 2개 (최대 100자), 감점 트리거 있으면 최소 1개는 트리거 원문 인용

JSON 형식:
{
  "sentiment": "positive" | "negative" | "neutral",
  "summary": "3~5문장 한국어 종합 평가",
  "strengths": ["한국어 강점 1문장", ...],
  "weaknesses": ["한국어 약점 1문장", ...],
  "keyQuotes": ["원문 인용 1", "원문 인용 2"]
}`;

    // Deterministic seed from sessionId — stabilizes summary draws across calls
    // (without seed, temperature 1.0 default caused re-grade to frequently produce
    // noticeably better/worse summaries from identical inputs)
    const summarySeed = Array.from(sessionId).reduce(
      (h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0,
      0
    );

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
          seed: summarySeed,
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
        // P1-3: Dynamic timeout based on remaining Vercel budget (default 120s, capped to budget)
        // Fix: guarantee minimum 60s for summary quality; cap at 120s
        timeoutMs: (() => {
          const SUMMARY_MIN_TIMEOUT_MS = 60_000;
          const SUMMARY_MAX_TIMEOUT_MS = 120_000;
          if (!timeBudgetMs) return SUMMARY_MAX_TIMEOUT_MS;
          return Math.max(SUMMARY_MIN_TIMEOUT_MS, Math.min(timeBudgetMs - 5_000, SUMMARY_MAX_TIMEOUT_MS));
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
      rawSummary = JSON.parse(
        completion.choices[0]?.message?.content || "{}"
      );
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

    // 세션에 요약 저장 (ai_summary 컬럼이 없을 수 있으므로 에러 처리)
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ ai_summary: summaryWithDependency })
      .eq("id", sessionId);

    if (updateError) {
      logError("[AUTO_GRADE] Error saving summary to database — retrying once", updateError, {
        path: "lib/grading.ts",
        additionalData: { sessionId },
      });
      // P0-3: Retry once after 1s — grades are already saved
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
