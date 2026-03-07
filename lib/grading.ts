import { openai, AI_MODEL_HEAVY } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  buildUnifiedGradingSystemPrompt,
  buildUnifiedGradingUserPrompt,
  buildSummaryEvaluationSystemPrompt,
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
} from "@/lib/grading-helpers";
import {
  buildAiTextMetadata,
  callTrackedChatCompletion,
} from "@/lib/ai-tracking";
import type {
  StageGrading,
  SummaryData,
} from "@/lib/types/grading";

/** Maximum time for the entire grading operation (180 seconds — heavy model needs more headroom) */
const GRADING_TIMEOUT_MS = 180_000;

// Initialize Supabase client
const supabase = getSupabaseServer();

interface GradeResult {
  q_idx: number;
  score: number; // 0-100
  comment: string;
  stage_grading?: StageGrading;
}

interface AutoGradeResult {
  grades: GradeResult[];
  summary: SummaryData | null;
  failedQuestions: number[];
  timedOut: boolean;
}

/**
 * 서버 사이드 자동 채점 함수
 * 루브릭 기반으로 각 문제를 0-100점으로 채점
 * Outer timeout (90s) 적용 — 시간 초과 시 완료된 채점만 저장
 */
export async function autoGradeSession(
  sessionId: string
): Promise<AutoGradeResult> {
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
    .select("id, title, questions, rubric, chat_weight")
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

  // 5. 데이터 압축 해제 및 정리 (헬퍼 함수 사용)
  const submissionsByQuestion = decompressSubmissions(submissions || []);
  const messagesByQuestion = decompressMessages(messages || []);

  // 6. 문제 정규화
  const questions = normalizeQuestions(exam.questions);

  // 7-8. 각 문제별 채점 (병렬 처리로 ~5배 속도 개선)
  // 루브릭은 문제별로 resolveQuestionRubric을 사용하여 해결
  const chatWeight = exam.chat_weight ?? 50;

  const gradePromises = questions.map(async (question): Promise<GradeResult | null> => {
    // Per-question rubric resolution
    const rubricItems = resolveQuestionRubric(question, exam.rubric);
    const rubricText = buildRubricText(rubricItems);
    const rubricScoresSchema = rubricItems
      .map(
        (item) =>
          `  "${item.evaluationArea}": 0-5 사이의 정수 (0: 전혀 충족하지 않음, 5: 완벽하게 충족)`
      )
      .join(",\n");
    const qIdx = question.idx;
    let submission = submissionsByQuestion[qIdx];
    if (!submission && questions.indexOf(question) >= 0) {
      const questionIndex = questions.indexOf(question);
      submission = submissionsByQuestion[questionIndex];
    }
    const questionMessages = messagesByQuestion[qIdx] || [];
    const aiDependencyAssessment = analyzeAiDependency({
      messages: questionMessages,
      finalAnswer: submission?.answer || "",
    });

    if (!submission) {
      return null;
    }

    // Unified grading: single call evaluates both chat + answer together
    const systemPrompt = buildUnifiedGradingSystemPrompt({
      rubricText,
      rubricScoresSchema,
      chatWeightPercent: chatWeight,
    });

    const userPrompt = buildUnifiedGradingUserPrompt({
      questionPrompt: question.prompt || "",
      questionAiContext: question.ai_context,
      messages: questionMessages,
      answer: submission.answer || "",
      aiDependencyAssessment,
    });

    const tracked = await callTrackedChatCompletion(
      () =>
        openai.chat.completions.create({
          model: AI_MODEL_HEAVY,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
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
    const completion = tracked.data;

    const parsed = JSON.parse(
      completion.choices[0]?.message?.content || "{}"
    );

    // Parse rubric_scores
    const rubricScores: Record<string, number> = {};
    if (parsed.rubric_scores && rubricItems.length > 0) {
      rubricItems.forEach((item) => {
        const score = parsed.rubric_scores[item.evaluationArea];
        if (typeof score === "number") {
          rubricScores[item.evaluationArea] = Math.max(0, Math.min(5, Math.round(score)));
        }
      });
    }
    const rubricScoresOrUndef = Object.keys(rubricScores).length > 0 ? rubricScores : undefined;

    // Build StageGrading — populate both chat and answer for backward compat
    const stageGrading: StageGrading = {};

    if (questionMessages.length > 0) {
      const rawChatScore = Math.max(0, Math.min(100, Math.round(parsed.chat_score || 0)));
      const adjustedChatScore = Math.max(0, Math.min(100, rawChatScore - aiDependencyAssessment.penaltyApplied));
      stageGrading.chat = {
        score: adjustedChatScore,
        comment: `${parsed.chat_comment || "채팅 단계 평가 완료"}\n\nAI 활용 해석: ${aiDependencyAssessment.summary}`,
        rubric_scores: rubricScoresOrUndef,
        ai_dependency: aiDependencyAssessment,
      };
    }

    if (submission.answer) {
      stageGrading.answer = {
        score: Math.max(0, Math.min(100, Math.round(parsed.answer_score || 0))),
        comment: parsed.answer_comment || "답안 평가 완료",
        rubric_scores: rubricScoresOrUndef,
      };
    }

    // 종합 점수 계산 — 가중 평균 (0-100 범위 보장)
    const finalScore = calculateWeightedScore(stageGrading, chatWeight);
    const overallComment = parsed.overall_comment
      || `채팅 단계: ${stageGrading.chat?.score ?? "N/A"}점, 답안 단계: ${stageGrading.answer?.score ?? "N/A"}점`;

    if (Object.keys(stageGrading).length > 0) {
      return {
        q_idx: qIdx,
        score: finalScore,
        comment: overallComment,
        stage_grading: stageGrading,
      };
    }

    return null;
  });

  // 모든 문제 병렬 채점 실행 (with outer timeout)
  const gradingPromise = Promise.allSettled(gradePromises);
  const timeoutPromise = new Promise<"TIMEOUT">((resolve) =>
    setTimeout(() => resolve("TIMEOUT"), GRADING_TIMEOUT_MS)
  );

  const raceResult = await Promise.race([gradingPromise, timeoutPromise]);
  const timedOut = raceResult === "TIMEOUT";

  // If timed out, still collect whatever results completed so far
  // Promise.allSettled doesn't reject, so we await it after timeout too
  const gradeResults = timedOut
    ? await Promise.allSettled(gradePromises.map((p) =>
        Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), 0))])
      ))
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
      failedQuestions.push(idx);
      logError("[AUTO_GRADE] Question grading failed", r.reason, {
        path: "lib/grading.ts",
        additionalData: { sessionId },
      });
    } else if (r.status === "fulfilled" && r.value === null && timedOut) {
      // Question was null due to timeout (not because it had no submission)
      const question = questions[idx];
      const submission = submissionsByQuestion[question?.idx];
      if (submission) {
        failedQuestions.push(idx);
      }
    }
  });

  if (timedOut) {
    logError("[AUTO_GRADE] Grading timed out", new Error(`Grading timed out after ${GRADING_TIMEOUT_MS}ms`), {
      path: "lib/grading.ts",
      additionalData: { sessionId, completedCount: grades.length, totalQuestions: questions.length },
    });
  }

  // 9. 채점 결과 저장 (partial 결과라도 저장)
  if (grades.length > 0) {
    const { error: insertError } = await supabase.from("grades").insert(
      grades.map((grade) => ({
        session_id: sessionId,
        q_idx: grade.q_idx,
        score: grade.score,
        comment: grade.comment,
        stage_grading: grade.stage_grading || null,
        grade_type: "auto",
      }))
    );

    if (insertError) {
      throw insertError;
    }
  }

  // 10. 요약 평가 생성 (timeout 시에도 완료된 결과로 시도)
  let summary: SummaryData | null = null;
  if (!timedOut) {
    try {
      summary = await generateSummary(
        sessionId,
        session.student_id,
        exam,
        questions,
        submissionsByQuestion,
        messagesByQuestion,
        grades
      );
    } catch (err) {
      logError("[AUTO_GRADE] Summary generation failed", err, {
        path: "lib/grading.ts",
        additionalData: { sessionId },
      });
    }
  }

  return { grades, summary, failedQuestions, timedOut };
}

/**
 * 종합 요약 평가 생성
 */
async function generateSummary(
  sessionId: string,
  studentId: string,
  exam: { id: string; title: string; rubric?: unknown },
  questions: Array<{ idx: number; prompt?: string; ai_context?: string }>,
  submissionsByQuestion: Record<number, { answer: string }>,
  messagesByQuestion: Record<number, Array<{ role: string; content: string }>>,
  grades: GradeResult[]
): Promise<SummaryData | null> {
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

        return `문제 ${index + 1}:
${q.prompt || ""}

답안:
${submission?.answer || "답안 없음"}
${chatHistoryText}

점수: ${grade?.score || 0}점
${
  grade?.stage_grading?.chat
    ? `채팅 단계 점수: ${grade.stage_grading.chat.score}점`
    : ""
}
${
  grade?.stage_grading?.answer
    ? `답안 단계 점수: ${grade.stage_grading.answer.score}점`
    : ""
}
${
  grade?.stage_grading?.chat?.ai_dependency
    ? `AI 활용/의존 신호:
${formatAiDependencyForPrompt(grade.stage_grading.chat.ai_dependency)}`
    : ""
}
`;
      })
      .join("\n---\n\n");

    const systemPrompt = buildSummaryEvaluationSystemPrompt();

    const userPrompt = `
      시험 제목: ${exam.title}
      
      ${rubricText}
      
      [학생의 답안, 채팅 대화 기록 및 점수]
      ${questionsText}
      
      [범용 평가 엄격화 가이드]
      - 질문의 '논리적 구조'와 '내용의 사실 관계'를 분리하여 평가하십시오.
      - 아래 5가지 행동 패턴이 발견되면 '이해도 부족'으로 간주하여 엄격히 평가합니다.
        사용된 표현의 형식(직접적/우회적/공손한)과 무관하게, 행동의 의도로 판단합니다:
        1) **답/풀이 위임형**: 자신의 분석 없이 AI에게 정답, 풀이법, 접근법, 프레임워크 선택을 요청. "어떻게 풀어?"든 "일반적으로 어떤 접근이 통용되나요?"든 의도가 동일하면 동일하게 판단.
        2) **출발점 의존형**: 어디서 시작해야 하는지, 어떤 개념을 써야 하는지를 AI에게 물어봄. 스스로 진입점을 잡지 못함.
        3) **조건/수치 변형형**: 시나리오에 명시된 수치/조건을 임의로 다른 값으로 바꿔서 질문하거나 답안에 사용.
        4) **개념 역전형**: 핵심 인과관계, 정의, 방향성을 거꾸로 이해하여 질문하거나 답안 작성.
        5) **교정 미반영형**: AI가 오류를 교정했음에도 최종 답안이 동일한 오류를 그대로 포함.
      - 질문의 양이 많더라도, 그 질문들이 문제의 본질(Core Task)에서 벗어난 지엽적인 것이라면 '자기주도적 학습 역량' 점수를 높게 주지 마십시오.
      - 직접 답변을 받은 사실 자체는 금지 위반이 아닙니다. 그러나 이후 독립 추론이 약하면 엄격히 감점하고, 회복이 확인되면 그 회복 근거를 분명히 적으십시오.
      - 학생이 주어지지 않은 정보를 논리적으로 가정(Assume)하여 논의를 진전시키는 경우에는 이를 '문제 해결을 위한 창의적 접근'으로 보아 긍정적으로 평가하십시오.
        다만, 이러한 가정이 문제에 이미 명시된 조건을 부정하는 용도로 쓰인다면 예외 없이 엄격하게 감점하십시오.

      [이해도 과대평가 방지 상한 규칙(매우 중요)]
      - 위 5가지 행동 패턴 중 하나라도 1회 이상 발견되었고,
        학생이 이후에 스스로 '개념 선택 + 조건/가정 정리 + 중간 추론/검증'을 모두 보여주지 못했다면 sentiment는 절대 positive로 주지 마세요.
      - 행동 패턴이 반복되거나, 개념 역전형 또는 교정 미반영형이 확인되면 negative를 우선하세요(회복이 매우 강한 경우만 neutral).
      
      위 내용을 바탕으로 학생의 전체적인 수행 능력을 상세하게 분석하여 요약 평가해주세요.
      **중요**: 채팅 대화 기록이 있는 경우, 학생이 AI와의 대화에서 보여준 질문의 질, 문제 이해도, 개념 파악 수준, 학습 태도 등을 종합적으로 고려하여 평가하세요.
      
      다음 항목을 반드시 포함해야 합니다:
      1. 전체적인 평가 (긍정적/부정적/중립적)
      2. 종합 의견: 학생의 답안과 채팅 대화 기록을 종합하여 전반에 대한 깊이 있는 분석. 답안의 논리성, 정확성, 창의성뿐만 아니라 채팅에서 보여준 학습 과정과 이해도도 함께 고려하세요.
      3. 주요 강점 (3가지 이내): 구체적인 예시를 들어 설명하세요. 채팅에서 보여준 질문의 질도 강점으로 포함할 수 있습니다.
      4. 개선이 필요한 점 (3가지 이내): 구체적인 개선 방안과 함께 제시하세요. 채팅에서 드러난 문제 이해 부족이나 개념 파악의 어려움을 포함하세요.
      5. 핵심 인용구 (2가지): 학생의 답안 또는 채팅 대화 중 평가에 결정적인 영향을 미친 문장이나 구절을 2개 뽑아주세요.
         - 감점 트리거가 있다면 2개 중 최소 1개는 그 문장을 반드시 원문 그대로 인용하세요.
      
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
        openai.chat.completions.create({
          model: AI_MODEL_HEAVY,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
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
        timeoutMs: 120_000,
        metadataBuilder: (result) =>
          buildAiTextMetadata({
            outputText:
              (result as { choices?: Array<{ message?: { content?: string | null } }> })
                .choices?.[0]?.message?.content ?? null,
          }),
      }
    );
    const completion = tracked.data;

    const result = JSON.parse(
      completion.choices[0]?.message?.content || "{}"
    ) as SummaryData;

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
      // 컬럼이 없는 경우 에러를 무시하고 계속 진행 (마이그레이션 필요)
      logError("[AUTO_GRADE] Error saving summary to database", updateError, {
        path: "lib/grading.ts",
        additionalData: { sessionId },
      });
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
