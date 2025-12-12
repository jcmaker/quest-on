import { openai, AI_MODEL } from "@/lib/openai";
import { createClient } from "@supabase/supabase-js";
import { decompressData } from "@/lib/compression";

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  const startTime = Date.now();

  console.log(
    `🤖 [AUTO_GRADE] Starting auto-grading for session: ${sessionId}`
  );

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
    .select("id, title, questions, rubric")
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
      ai_feedback,
      student_reply,
      compressed_answer_data,
      compressed_feedback_data
    `
    )
    .eq("session_id", sessionId);

  if (submissionsError) {
    console.error("Error fetching submissions:", submissionsError);
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
    .eq("session_id", sessionId);

  if (messagesError) {
    console.error("Error fetching messages:", messagesError);
  }

  // 5. 데이터 압축 해제 및 정리
  const submissionsByQuestion: Record<
    number,
    {
      answer: string;
      ai_feedback?: string;
      student_reply?: string;
    }
  > = {};

  if (submissions) {
    submissions.forEach((submission: Record<string, unknown>) => {
      const qIdx = submission.q_idx as number;
      let answer = submission.answer as string;

      if (
        submission.compressed_answer_data &&
        typeof submission.compressed_answer_data === "string"
      ) {
        try {
          const decompressed = decompressData(
            submission.compressed_answer_data as string
          );
          answer = (decompressed as { answer?: string })?.answer || answer;
        } catch (error) {
          console.error("Error decompressing answer data:", error);
        }
      }

      submissionsByQuestion[qIdx] = {
        answer: answer || "",
        ai_feedback:
          typeof submission.ai_feedback === "string"
            ? submission.ai_feedback
            : undefined,
        student_reply:
          typeof submission.student_reply === "string"
            ? submission.student_reply
            : undefined,
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
        } catch (error) {
          console.error("Error decompressing message content:", error);
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
            typeof q.ai_context === "string"
              ? q.ai_context
              : typeof q.core_ability === "string"
              ? q.core_ability
              : undefined,
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

  // 8. 각 문제별 채점
  const grades: GradeResult[] = [];

  for (const question of questions) {
    const qIdx = question.idx;
    let submission = submissionsByQuestion[qIdx];
    if (!submission && questions.indexOf(question) >= 0) {
      const questionIndex = questions.indexOf(question);
      submission = submissionsByQuestion[questionIndex];
    }
    const questionMessages = messagesByQuestion[qIdx] || [];

    if (!submission) {
      console.log(
        `⚠️ [AUTO_GRADE] No submission found for question ${qIdx}, skipping`
      );
      continue;
    }

    const stageGrading: {
      chat?: {
        score: number;
        comment: string;
        rubric_scores?: Record<string, number>;
      };
      answer?: {
        score: number;
        comment: string;
        rubric_scores?: Record<string, number>;
      };
      feedback?: {
        score: number;
        comment: string;
        rubric_scores?: Record<string, number>;
      };
    } = {};

    // 8-1. Chat stage 채점
    if (questionMessages.length > 0) {
      try {
        const rubricScoresSchema = rubricItems
          .map(
            (item) =>
              `  "${item.evaluationArea}": 0-5 사이의 정수 (0: 전혀 충족하지 않음, 5: 완벽하게 충족)`
          )
          .join(",\n");

        const chatSystemPrompt = `당신은 전문 평가위원입니다. 학생과 AI의 대화 과정을 루브릭 기준에 따라 평가하고 점수를 부여합니다.

${rubricText}

평가 지침:
1. 제공된 루브릭의 각 평가 영역과 기준을 정확히 검토하세요.
2. 학생이 AI와의 대화에서 보여준 질문의 질, 문제 이해도, 개념 파악 수준을 평가하세요.
3. AI의 답변을 통해 학생이 얼마나 효과적으로 학습하고 개선했는지 평가하세요.
4. 전체 점수는 0-100점 사이의 정수로 부여하세요.
5. 각 루브릭 항목별로 0-5점 척도로 평가하세요 (0: 전혀 충족하지 않음, 5: 완벽하게 충족).
6. 구체적이고 건설적인 피드백을 제공하세요.

응답 형식 (JSON):
{
  "score": 75,
  "comment": "대화 과정에서 보여준 학습 태도와 이해도를 평가한 내용을 한국어로 작성하세요.",
  "rubric_scores": {
${rubricScoresSchema}
  }
}`;

        const chatUserPrompt = `다음 정보를 바탕으로 채팅 단계를 평가해주세요:

**문제:**
${question.prompt || ""}

${question.ai_context ? `**문제 컨텍스트:**\n${question.ai_context}\n` : ""}

**학생과 AI의 대화 기록:**
${questionMessages
  .map((msg) => `${msg.role === "user" ? "학생" : "AI"}: ${msg.content}`)
  .join("\n\n")}

위 정보를 바탕으로 루브릭 기준에 따라 채팅 단계의 점수와 피드백을 제공해주세요.`;

        const chatCompletion = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [
            { role: "system", content: chatSystemPrompt },
            { role: "user", content: chatUserPrompt },
          ],
          response_format: { type: "json_object" },
        });

        const chatResponseContent =
          chatCompletion.choices[0]?.message?.content || "";
        const chatParsedResponse = JSON.parse(chatResponseContent);

        // 루브릭 항목별 점수 추출
        const rubricScores: Record<string, number> = {};
        if (chatParsedResponse.rubric_scores && rubricItems.length > 0) {
          rubricItems.forEach((item) => {
            const score = chatParsedResponse.rubric_scores[item.evaluationArea];
            if (typeof score === "number") {
              rubricScores[item.evaluationArea] = Math.max(
                0,
                Math.min(5, Math.round(score))
              );
            }
          });
        }

        stageGrading.chat = {
          score: Math.max(
            0,
            Math.min(100, Math.round(chatParsedResponse.score || 0))
          ),
          comment: chatParsedResponse.comment || "채팅 단계 평가 완료",
          rubric_scores:
            Object.keys(rubricScores).length > 0 ? rubricScores : undefined,
        };

        console.log(
          `✅ [AUTO_GRADE] Question ${qIdx} chat stage: ${stageGrading.chat.score}점`
        );
      } catch (error) {
        console.error(
          `❌ [AUTO_GRADE] Error grading chat stage for question ${qIdx}:`,
          error
        );
      }
    }

    // 8-2. Answer stage 채점
    if (submission.answer) {
      try {
        const answerRubricScoresSchema = rubricItems
          .map(
            (item) =>
              `  "${item.evaluationArea}": 0-5 사이의 정수 (0: 전혀 충족하지 않음, 5: 완벽하게 충족)`
          )
          .join(",\n");

        const answerSystemPrompt = `당신은 전문 평가위원입니다. 학생의 최종 답안을 루브릭 기준에 따라 평가하고 점수를 부여합니다.

${rubricText}

평가 지침:
1. 제공된 루브릭의 각 평가 영역과 기준을 정확히 검토하세요.
2. 학생의 답안이 루브릭의 각 평가 영역을 얼마나 충족하는지 평가하세요.
3. 답안의 완성도, 논리성, 정확성을 종합적으로 평가하세요.
4. 전체 점수는 0-100점 사이의 정수로 부여하세요.
5. 각 루브릭 항목별로 0-5점 척도로 평가하세요 (0: 전혀 충족하지 않음, 5: 완벽하게 충족).
6. 구체적이고 건설적인 피드백을 제공하세요.

응답 형식 (JSON):
{
  "score": 75,
  "comment": "답안의 강점과 개선점을 루브릭 기준에 따라 평가한 내용을 한국어로 작성하세요.",
  "rubric_scores": {
${answerRubricScoresSchema}
  }
}`;

        const answerUserPrompt = `다음 정보를 바탕으로 최종 답안을 평가해주세요:

**문제:**
${question.prompt || ""}

${question.ai_context ? `**문제 컨텍스트:**\n${question.ai_context}\n` : ""}

**학생의 최종 답안:**
${submission.answer || "답안이 없습니다."}

위 정보를 바탕으로 루브릭 기준에 따라 답안의 점수와 피드백을 제공해주세요.`;

        const answerCompletion = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [
            { role: "system", content: answerSystemPrompt },
            { role: "user", content: answerUserPrompt },
          ],
          response_format: { type: "json_object" },
        });

        const answerResponseContent =
          answerCompletion.choices[0]?.message?.content || "";
        const answerParsedResponse = JSON.parse(answerResponseContent);

        // 루브릭 항목별 점수 추출
        const answerRubricScores: Record<string, number> = {};
        if (answerParsedResponse.rubric_scores && rubricItems.length > 0) {
          rubricItems.forEach((item) => {
            const score =
              answerParsedResponse.rubric_scores[item.evaluationArea];
            if (typeof score === "number") {
              answerRubricScores[item.evaluationArea] = Math.max(
                0,
                Math.min(5, Math.round(score))
              );
            }
          });
        }

        stageGrading.answer = {
          score: Math.max(
            0,
            Math.min(100, Math.round(answerParsedResponse.score || 0))
          ),
          comment: answerParsedResponse.comment || "답안 평가 완료",
          rubric_scores:
            Object.keys(answerRubricScores).length > 0
              ? answerRubricScores
              : undefined,
        };

        console.log(
          `✅ [AUTO_GRADE] Question ${qIdx} answer stage: ${stageGrading.answer.score}점`
        );
      } catch (error) {
        console.error(
          `❌ [AUTO_GRADE] Error grading answer stage for question ${qIdx}:`,
          error
        );
      }
    }

    // 8-3. Feedback stage 채점
    if (submission.ai_feedback && submission.student_reply) {
      try {
        const feedbackRubricScoresSchema = rubricItems
          .map(
            (item) =>
              `  "${item.evaluationArea}": 0-5 사이의 정수 (0: 전혀 충족하지 않음, 5: 완벽하게 충족)`
          )
          .join(",\n");

        const feedbackSystemPrompt = `당신은 전문 평가위원입니다. AI 피드백에 대한 학생의 반박 답변을 루브릭 기준에 따라 평가하고 점수를 부여합니다.

${rubricText}

평가 지침:
1. 제공된 루브릭의 각 평가 영역과 기준을 정확히 검토하세요.
2. 학생이 AI 피드백을 제대로 이해하고 반박했는지 평가하세요.
3. 학생의 반박 내용이 논리적이고 타당한지 평가하세요.
4. 피드백을 통해 학생이 얼마나 성장했는지 평가하세요.
5. 전체 점수는 0-100점 사이의 정수로 부여하세요.
6. 각 루브릭 항목별로 0-5점 척도로 평가하세요 (0: 전혀 충족하지 않음, 5: 완벽하게 충족).
7. 구체적이고 건설적인 피드백을 제공하세요.

응답 형식 (JSON):
{
  "score": 75,
  "comment": "피드백에 대한 학생의 반박 답변을 루브릭 기준에 따라 평가한 내용을 한국어로 작성하세요.",
  "rubric_scores": {
${feedbackRubricScoresSchema}
  }
}`;

        const feedbackUserPrompt = `다음 정보를 바탕으로 피드백 대응 단계를 평가해주세요:

**문제:**
${question.prompt || ""}

${question.ai_context ? `**문제 컨텍스트:**\n${question.ai_context}\n` : ""}

**학생의 최종 답안:**
${submission.answer || "답안이 없습니다."}

**AI 피드백:**
${submission.ai_feedback}

**학생의 반박 답변:**
${submission.student_reply}

위 정보를 바탕으로 루브릭 기준에 따라 피드백 대응 단계의 점수와 피드백을 제공해주세요.`;

        const feedbackCompletion = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [
            { role: "system", content: feedbackSystemPrompt },
            { role: "user", content: feedbackUserPrompt },
          ],
          response_format: { type: "json_object" },
        });

        const feedbackResponseContent =
          feedbackCompletion.choices[0]?.message?.content || "";
        const feedbackParsedResponse = JSON.parse(feedbackResponseContent);

        // 루브릭 항목별 점수 추출
        const feedbackRubricScores: Record<string, number> = {};
        if (feedbackParsedResponse.rubric_scores && rubricItems.length > 0) {
          rubricItems.forEach((item) => {
            const score =
              feedbackParsedResponse.rubric_scores[item.evaluationArea];
            if (typeof score === "number") {
              feedbackRubricScores[item.evaluationArea] = Math.max(
                0,
                Math.min(5, Math.round(score))
              );
            }
          });
        }

        stageGrading.feedback = {
          score: Math.max(
            0,
            Math.min(100, Math.round(feedbackParsedResponse.score || 0))
          ),
          comment: feedbackParsedResponse.comment || "피드백 대응 평가 완료",
          rubric_scores:
            Object.keys(feedbackRubricScores).length > 0
              ? feedbackRubricScores
              : undefined,
        };

        console.log(
          `✅ [AUTO_GRADE] Question ${qIdx} feedback stage: ${stageGrading.feedback.score}점`
        );
      } catch (error) {
        console.error(
          `❌ [AUTO_GRADE] Error grading feedback stage for question ${qIdx}:`,
          error
        );
      }
    }

    // 8-4. 종합 점수 계산 (0-100 범위 보장)
    let overallScore = 0;
    let stageCount = 0;
    if (stageGrading.chat) {
      overallScore += stageGrading.chat.score;
      stageCount++;
    }
    if (stageGrading.answer) {
      overallScore += stageGrading.answer.score;
      stageCount++;
    }
    if (stageGrading.feedback) {
      overallScore += stageGrading.feedback.score;
      stageCount++;
    }

    // 0-100 범위로 명시적으로 제한 (평균 계산 후)
    const finalScore =
      stageCount > 0
        ? Math.max(0, Math.min(100, Math.round(overallScore / stageCount)))
        : 0;
    const overallComment = `채팅 단계: ${
      stageGrading.chat?.score || "N/A"
    }점, 답안 단계: ${stageGrading.answer?.score || "N/A"}점, 피드백 단계: ${
      stageGrading.feedback?.score || "N/A"
    }점`;

    // 최소 하나의 단계라도 채점되었으면 추가
    if (Object.keys(stageGrading).length > 0) {
      grades.push({
        q_idx: qIdx,
        score: finalScore, // 0-100 점수
        comment: overallComment,
        stage_grading: stageGrading,
      });

      console.log(
        `✅ [AUTO_GRADE] Question ${qIdx} overall: ${finalScore}점 (stages: ${Object.keys(
          stageGrading
        ).join(", ")})`
      );
    }
  }

  // 9. 채점 결과 저장
  if (grades.length > 0) {
    const { error: insertError } = await supabase.from("grades").insert(
      grades.map((grade) => ({
        session_id: sessionId,
        q_idx: grade.q_idx,
        score: grade.score,
        comment: grade.comment,
        stage_grading: grade.stage_grading || null,
      }))
    );

    if (insertError) {
      console.error(`❌ [AUTO_GRADE] Database insert error:`, insertError);
      throw insertError;
    }
    console.log(`✅ [AUTO_GRADE] Saved ${grades.length} grades`);
  }

  // 10. 요약 평가 생성
  let summary: SummaryResult | null = null;
  try {
    summary = await generateSummary(
      sessionId,
      exam,
      questions,
      submissionsByQuestion,
      grades
    );
  } catch (error) {
    console.error(`❌ [AUTO_GRADE] Error generating summary:`, error);
    // 요약 생성 실패해도 채점 결과는 반환
  }

  const duration = Date.now() - startTime;
  console.log(
    `✅ [AUTO_GRADE] Completed in ${duration}ms | Session: ${sessionId} | Grades: ${grades.length}`
  );

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
        return `문제 ${index + 1}:
${q.prompt || ""}

답안:
${submission?.answer || "답안 없음"}

점수: ${grade?.score || 0}점
`;
      })
      .join("\n---\n\n");

    const systemPrompt = `당신은 전문 평가위원입니다. 학생의 전체 답안을 종합적으로 분석하여 요약 평가를 생성합니다.`;

    const userPrompt = `
시험 제목: ${exam.title}

${rubricText}

[학생의 답안 및 점수]
${questionsText}

위 내용을 바탕으로 학생의 전체적인 수행 능력을 상세하게 분석하여 요약 평가해주세요.
다음 항목을 반드시 포함해야 합니다:
1. 전체적인 평가 (긍정적/부정적/중립적)
2. 종합 의견: 학생의 답안 전반에 대한 깊이 있는 분석. 답안의 논리성, 정확성, 창의성 등을 종합적으로 고려하세요.
3. 주요 강점 (3가지 이내): 구체적인 예시를 들어 설명하세요.
4. 개선이 필요한 점 (3가지 이내): 구체적인 개선 방안과 함께 제시하세요.
5. 핵심 인용구 (2가지): 학생의 답안 중 평가에 결정적인 영향을 미친 문장이나 구절을 2개 뽑아주세요.

JSON 형식으로 응답해주세요:
{
  "sentiment": "positive" | "negative" | "neutral",
  "summary": "상세한 종합 의견 텍스트",
  "strengths": ["강점1", "강점2", ...],
  "weaknesses": ["약점1", "약점2", ...],
  "keyQuotes": ["인용구1", "인용구2"]
}`;

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(
      completion.choices[0]?.message?.content || "{}"
    ) as SummaryResult;

    // 세션에 요약 저장 (ai_summary 컬럼이 없을 수 있으므로 에러 처리)
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ ai_summary: result })
      .eq("id", sessionId);

    if (updateError) {
      console.error(
        `❌ [AUTO_GRADE] Error saving summary to database:`,
        updateError
      );
      // 컬럼이 없는 경우 에러를 무시하고 계속 진행 (마이그레이션 필요)
      if (
        updateError.code === "42703" ||
        updateError.message?.includes("does not exist")
      ) {
        console.warn(
          `⚠️ [AUTO_GRADE] ai_summary column does not exist. Please run migration to add the column.`
        );
      }
    } else {
      console.log(`✅ [AUTO_GRADE] Summary saved for session: ${sessionId}`);
    }

    return result;
  } catch (error) {
    console.error("Error generating summary:", error);
    return null;
  }
}
