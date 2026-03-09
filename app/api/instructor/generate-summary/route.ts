export const maxDuration = 120;

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { decompressData } from "@/lib/compression";
import { currentUser } from "@/lib/get-current-user";
import { getOpenAI, AI_MODEL_HEAVY } from "@/lib/openai";
import { buildSummaryGenerationSystemPrompt } from "@/lib/prompts";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  buildAiTextMetadata,
  callTrackedChatCompletion,
} from "@/lib/ai-tracking";

const supabase = getSupabaseServer();

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Rate limit: expensive OpenAI summary generation
    const rl = await checkRateLimitAsync(`ai:generate-summary:${user.id}`, RATE_LIMITS.ai);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return errorJson("MISSING_SESSION_ID", "Session ID required", 400);
    }

    // Fetch session
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id, student_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    // Fetch exam
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title, questions, rubric, instructor_id")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Fetch submissions
    const { data: submissions, error: submissionsError } = await supabase
      .from("submissions")
      .select("q_idx, answer, compressed_answer_data")
      .eq("session_id", sessionId);

    if (submissionsError) {
      throw submissionsError;
    }

    // Process submissions
    const processedSubmissions = submissions.map((sub) => {
      let answer = sub.answer;
      if (sub.compressed_answer_data) {
        try {
          const decompressed = decompressData(sub.compressed_answer_data);
          answer = (decompressed as { answer?: string }).answer || answer;
        } catch {
          // Use original answer on decompression failure
        }
      }
      return {
        q_idx: sub.q_idx,
        answer,
      };
    });

    // Construct Prompt
    const questionsText = (exam.questions as Record<string, unknown>[])
      .map((q: Record<string, unknown>, i: number) => {
        const sub = processedSubmissions.find((s) => s.q_idx === (q.idx ?? i));
        return `문제 ${i + 1}: ${q.prompt || q.text}\n학생 답안: ${
          sub ? sub.answer : "답안 없음"
        }`;
      })
      .join("\n\n");

    const rubricText = Array.isArray(exam.rubric)
      ? exam.rubric
          .map(
            (r: Record<string, unknown>) =>
              `- ${r.evaluationArea}: ${r.detailedCriteria}`
          )
          .join("\n")
      : "별도의 루브릭 없음";

    const systemPrompt = buildSummaryGenerationSystemPrompt();
    const userPrompt = `
시험 제목: ${exam.title}

[평가 루브릭]
${rubricText}

[학생의 답안]
${questionsText}

위 내용을 바탕으로 학생의 전체적인 수행 능력을 상세하게 분석하여 요약 평가해주세요.
다음 항목을 반드시 포함해야 합니다:
1. 전체적인 평가 (긍정적/부정적/중립적)
2. 종합 의견: 학생의 답안 전반에 대한 깊이 있는 분석. 답안의 논리성, 정확성, 창의성 등을 종합적으로 고려하세요.
3. 주요 강점 (3가지 이내): 구체적인 예시를 들어 설명하세요.
4. 개선이 필요한 점 (3가지 이내): 구체적인 개선 방안과 함께 제시하세요.
5. 핵심 인용구 (2가지): 학생의 답안 중 평가에 결정적인 영향을 미친 문장이나 구절을 2개 뽑아주세요. (하이라이트용)

JSON 형식으로 응답해주세요:
{
  "sentiment": "positive" | "negative" | "neutral",
  "summary": "상세한 종합 의견 텍스트",
  "strengths": ["강점1", "강점2", ...],
  "weaknesses": ["약점1", "약점2", ...],
  "keyQuotes": ["인용구1", "인용구2"]
}
`;

    const tracked = await callTrackedChatCompletion(
      () =>
        getOpenAI().chat.completions.create({
          model: AI_MODEL_HEAVY,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      {
        feature: "generate_summary",
        route: "/api/instructor/generate-summary",
        model: AI_MODEL_HEAVY,
        userId: user.id,
        examId: exam.id,
        sessionId,
        metadata: buildAiTextMetadata({
          inputText: [systemPrompt, userPrompt],
          extra: {
            question_count: processedSubmissions.length,
          },
        }),
      },
      {
        timeoutMs: 60_000,
        metadataBuilder: (result) =>
          buildAiTextMetadata({
            outputText:
              (result as { choices?: Array<{ message?: { content?: string | null } }> })
                .choices?.[0]?.message?.content ?? null,
          }),
      }
    );
    const completion = tracked.data;

    const result = JSON.parse(completion.choices[0].message.content || "{}");

    // Save summary to database
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ ai_summary: result })
      .eq("id", sessionId);

    if (updateError) {
      // Don't fail the request if saving summary fails
    }

    return successJson({ summary: result });
  } catch (error: unknown) {
    logError("Summary generation failed", error, { path: "/api/instructor/generate-summary" });
    return errorJson(
      "SUMMARY_GENERATION_FAILED",
      "요약 생성 중 오류가 발생했습니다.",
      500
    );
  }
}
