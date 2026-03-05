import { openai, AI_MODEL, callOpenAI } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import { decompressData } from "@/lib/compression";
import {
  buildChatGradingSystemPrompt,
  buildAnswerGradingSystemPrompt,
  buildChatGradingUserPrompt,
  buildAnswerGradingUserPrompt,
  buildSummaryEvaluationSystemPrompt,
} from "@/lib/prompts";
import { logError } from "@/lib/logger";

// Initialize Supabase client
const supabase = getSupabaseServer();

interface GradeResult {
  q_idx: number;
  score: number; // 0-100
  comment: string;
  stage_grading?: {
    chat?: { score: number; comment: string };
    answer?: { score: number; comment: string };
    feedback?: { score: number; comment: string };
  };
}

interface SummaryResult {
  sentiment: "positive" | "negative" | "neutral";
  summary: string;
  strengths: string[];
  weaknesses: string[];
  keyQuotes: string[];
}

/**
 * 서버 사이드 자동 채점 함수
 * 루브릭 기반으로 각 문제를 0-100점으로 채점
 */
export async function autoGradeSession(
  sessionId: string
): Promise<{ grades: GradeResult[]; summary: SummaryResult | null }> {
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

  // 5. 데이터 압축 해제 및 정리
  // 같은 q_idx에 여러 submission이 있으면 가장 최신 것(또는 가장 완전한 것)을 선택
  const submissionsByQuestion: Record<
    number,
    {
      answer: string;
    }
  > = {};

  if (submissions) {
    // q_idx별로 그룹화하고, 각 그룹에서 가장 최신이거나 가장 완전한 것을 선택
    const submissionsByQIdx = new Map<number, Array<Record<string, unknown>>>();

    submissions.forEach((submission: Record<string, unknown>) => {
      const qIdx = submission.q_idx as number;
      if (!submissionsByQIdx.has(qIdx)) {
        submissionsByQIdx.set(qIdx, []);
      }
      submissionsByQIdx.get(qIdx)!.push(submission);
    });

    // 각 q_idx에 대해 가장 좋은 submission 선택
    submissionsByQIdx.forEach((subs, qIdx) => {
      // 같은 q_idx에 여러 submission이 있으면:
      // 1. answer가 가장 긴 것 (더 완전한 답안)
      // 2. 가장 최신 것
      const bestSubmission = subs.reduce((best, current) => {
        const bestAnswer = (best.answer as string) || "";
        const currentAnswer = (current.answer as string) || "";

        // answer가 더 긴 것을 우선
        if (currentAnswer.length > bestAnswer.length) return current;
        if (bestAnswer.length > currentAnswer.length) return best;

        // 최신 것을 우선 (created_at 비교)
        const bestCreated = best.created_at
          ? new Date(best.created_at as string).getTime()
          : 0;
        const currentCreated = current.created_at
          ? new Date(current.created_at as string).getTime()
          : 0;
        return currentCreated > bestCreated ? current : best;
      });

      let answer = (bestSubmission.answer as string) || "";

      if (
        bestSubmission.compressed_answer_data &&
        typeof bestSubmission.compressed_answer_data === "string"
      ) {
        try {
          const decompressed = decompressData(
            bestSubmission.compressed_answer_data as string
          );
          answer = (decompressed as { answer?: string })?.answer || answer;
        } catch {
          // Decompression failed, fall back to raw answer
        }
      }

      submissionsByQuestion[qIdx] = {
        answer: answer || "",
      };
    });
  }

  const messagesByQuestion: Record<
    number,
    Array<{ role: string; content: string }>
  > = {};

  if (messages) {
    messages.forEach((message: Record<string, unknown>) => {
      const qIdx = message.q_idx as number;
      let content = message.content as string;

      if (
        message.compressed_content &&
        typeof message.compressed_content === "string"
      ) {
        try {
          content =
            (decompressData(message.compressed_content as string) as string) ||
            content;
        } catch {
          // Decompression failed, fall back to raw content
        }
      }

      if (!messagesByQuestion[qIdx]) {
        messagesByQuestion[qIdx] = [];
      }

      messagesByQuestion[qIdx].push({
        role: message.role as string,
        content: content || "",
      });
    });
  }

  // 6. 문제 정규화
  const questions: Array<{
    idx: number;
    prompt?: string;
    ai_context?: string;
  }> = exam.questions
    ? Array.isArray(exam.questions)
      ? exam.questions.map((q: Record<string, unknown>, index: number) => ({
          idx: q.idx !== undefined ? (q.idx as number) : index,
          prompt:
            typeof q.prompt === "string"
              ? q.prompt
              : typeof q.text === "string"
              ? q.text
              : undefined,
          ai_context:
            typeof q.ai_context === "string" ? q.ai_context : undefined,
        }))
      : []
    : [];

  // 7. 루브릭 텍스트 생성
  const rubricItems =
    exam.rubric && Array.isArray(exam.rubric) && exam.rubric.length > 0
      ? (exam.rubric as Array<{
          evaluationArea: string;
          detailedCriteria: string;
        }>)
      : [];

  const rubricText =
    rubricItems.length > 0
      ? `
**평가 루브릭 기준:**
${rubricItems
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

  // 8. 각 문제별 채점 (병렬 처리로 ~5배 속도 개선)
  const rubricScoresSchema = rubricItems
    .map(
      (item) =>
        `  "${item.evaluationArea}": 0-5 사이의 정수 (0: 전혀 충족하지 않음, 5: 완벽하게 충족)`
    )
    .join(",\n");

  const gradePromises = questions.map(async (question): Promise<GradeResult | null> => {
    const qIdx = question.idx;
    let submission = submissionsByQuestion[qIdx];
    if (!submission && questions.indexOf(question) >= 0) {
      const questionIndex = questions.indexOf(question);
      submission = submissionsByQuestion[questionIndex];
    }
    const questionMessages = messagesByQuestion[qIdx] || [];

    if (!submission) {
      return null;
    }

    // Chat + Answer 채점을 병렬 실행
    const [chatResult, answerResult] = await Promise.allSettled([
      // 8-1. Chat stage 채점
      questionMessages.length > 0
        ? (async () => {
            const chatSystemPrompt = buildChatGradingSystemPrompt({
              rubricText,
              rubricScoresSchema,
            });

            const chatUserPrompt = buildChatGradingUserPrompt({
              questionPrompt: question.prompt || "",
              questionAiContext: question.ai_context,
              messages: questionMessages,
            });

            const chatCompletion = await callOpenAI(() =>
              openai.chat.completions.create({
                model: AI_MODEL,
                messages: [
                  { role: "system", content: chatSystemPrompt },
                  { role: "user", content: chatUserPrompt },
                ],
                response_format: { type: "json_object" },
              })
            );

            const chatParsedResponse = JSON.parse(
              chatCompletion.choices[0]?.message?.content || ""
            );

            const rubricScores: Record<string, number> = {};
            if (chatParsedResponse.rubric_scores && rubricItems.length > 0) {
              rubricItems.forEach((item) => {
                const score = chatParsedResponse.rubric_scores[item.evaluationArea];
                if (typeof score === "number") {
                  rubricScores[item.evaluationArea] = Math.max(0, Math.min(5, Math.round(score)));
                }
              });
            }

            return {
              score: Math.max(0, Math.min(100, Math.round(chatParsedResponse.score || 0))),
              comment: chatParsedResponse.comment || "채팅 단계 평가 완료",
              rubric_scores: Object.keys(rubricScores).length > 0 ? rubricScores : undefined,
            };
          })()
        : Promise.resolve(null),

      // 8-2. Answer stage 채점
      submission.answer
        ? (async () => {
            const answerSystemPrompt = buildAnswerGradingSystemPrompt({
              rubricText,
              rubricScoresSchema,
            });

            const answerUserPrompt = buildAnswerGradingUserPrompt({
              questionPrompt: question.prompt || "",
              questionAiContext: question.ai_context,
              answer: submission.answer || "",
            });

            const answerCompletion = await callOpenAI(() =>
              openai.chat.completions.create({
                model: AI_MODEL,
                messages: [
                  { role: "system", content: answerSystemPrompt },
                  { role: "user", content: answerUserPrompt },
                ],
                response_format: { type: "json_object" },
              })
            );

            const answerParsedResponse = JSON.parse(
              answerCompletion.choices[0]?.message?.content || ""
            );

            const answerRubricScores: Record<string, number> = {};
            if (answerParsedResponse.rubric_scores && rubricItems.length > 0) {
              rubricItems.forEach((item) => {
                const score = answerParsedResponse.rubric_scores[item.evaluationArea];
                if (typeof score === "number") {
                  answerRubricScores[item.evaluationArea] = Math.max(0, Math.min(5, Math.round(score)));
                }
              });
            }

            return {
              score: Math.max(0, Math.min(100, Math.round(answerParsedResponse.score || 0))),
              comment: answerParsedResponse.comment || "답안 평가 완료",
              rubric_scores: Object.keys(answerRubricScores).length > 0 ? answerRubricScores : undefined,
            };
          })()
        : Promise.resolve(null),
    ]);

    // 결과 조합
    const stageGrading: {
      chat?: { score: number; comment: string; rubric_scores?: Record<string, number> };
      answer?: { score: number; comment: string; rubric_scores?: Record<string, number> };
    } = {};

    if (chatResult.status === "fulfilled" && chatResult.value) {
      stageGrading.chat = chatResult.value;
    }

    if (answerResult.status === "fulfilled" && answerResult.value) {
      stageGrading.answer = answerResult.value;
    }

    // 8-3. 종합 점수 계산 — 가중 평균 (0-100 범위 보장)
    const chatWeight = (exam.chat_weight ?? 50) / 100;
    const answerWeight = 1 - chatWeight;

    let finalScore = 0;
    if (stageGrading.chat && stageGrading.answer) {
      finalScore = Math.round(
        stageGrading.chat.score * chatWeight +
          stageGrading.answer.score * answerWeight
      );
    } else if (stageGrading.chat) {
      finalScore = stageGrading.chat.score;
    } else if (stageGrading.answer) {
      finalScore = stageGrading.answer.score;
    }
    finalScore = Math.max(0, Math.min(100, finalScore));
    const overallComment = `채팅 단계: ${
      stageGrading.chat?.score || "N/A"
    }점, 답안 단계: ${stageGrading.answer?.score || "N/A"}점`;

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

  // 모든 문제 병렬 채점 실행
  const gradeResults = await Promise.allSettled(gradePromises);
  const grades: GradeResult[] = gradeResults
    .filter(
      (r): r is PromiseFulfilledResult<GradeResult | null> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value!);

  // 실패한 문제 로깅
  gradeResults.forEach((r) => {
    if (r.status === "rejected") {
      logError("[AUTO_GRADE] Question grading failed", r.reason, {
        path: "lib/grading.ts",
        additionalData: { sessionId },
      });
    }
  });

  // 9. 채점 결과 저장
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

  // 10. 요약 평가 생성
  let summary: SummaryResult | null = null;
  try {
    summary = await generateSummary(
      sessionId,
      exam,
      questions,
      submissionsByQuestion,
      messagesByQuestion,
      grades
    );
  } catch {
    // 요약 생성 실패해도 채점 결과는 반환
  }

  return { grades, summary };
}

/**
 * 종합 요약 평가 생성
 */
async function generateSummary(
  sessionId: string,
  exam: { title: string; rubric?: unknown },
  questions: Array<{ idx: number; prompt?: string; ai_context?: string }>,
  submissionsByQuestion: Record<number, { answer: string }>,
  messagesByQuestion: Record<number, Array<{ role: string; content: string }>>,
  grades: GradeResult[]
): Promise<SummaryResult | null> {
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

    const completion = await callOpenAI(() =>
      openai.chat.completions.create({
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      })
    );

    const result = JSON.parse(
      completion.choices[0]?.message?.content || "{}"
    ) as SummaryResult;

    // 세션에 요약 저장 (ai_summary 컬럼이 없을 수 있으므로 에러 처리)
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ ai_summary: result })
      .eq("id", sessionId);

    if (updateError) {
      // 컬럼이 없는 경우 에러를 무시하고 계속 진행 (마이그레이션 필요)
      logError("[AUTO_GRADE] Error saving summary to database", updateError, {
        path: "lib/grading.ts",
        additionalData: { sessionId },
      });
    }

    return result;
  } catch {
    return null;
  }
}
