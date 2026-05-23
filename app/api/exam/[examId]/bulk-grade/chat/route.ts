export const maxDuration = 120;

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getOpenAI, AI_MODEL } from "@/lib/openai";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { requireBulkGradeAccess } from "@/lib/bulk-grade-access";
import { bulkGradeChatPostSchema, validateRequest } from "@/lib/validations";
import {
  buildAiTextMetadata,
  callTrackedChatCompletion,
} from "@/lib/ai-tracking";
import {
  loadExamCaseData,
  parseGradesFromAiResponse,
  buildProposedGradesMap,
  estimateTokenCount,
} from "@/lib/bulk-grading";
import { buildBulkGradingSystemPrompt } from "@/lib/prompts";
import { getSupabaseServer } from "@/lib/supabase-server";

const BULK_GRADE_CHAT_RATE_LIMIT = { limit: 5, windowSec: 60 };
const GPT4O_MAX_TOKENS = 128_000;
const CONTEXT_WARN_RATIO = 0.7;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const { examId } = await params;
    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    const user = await currentUser();
    const body = await request.json();
    const validation = validateRequest(bulkGradeChatPostSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error, 400);
    }

    const { message } = validation.data;

    const rl = await checkRateLimitAsync(
      `bulk-grade-chat:${user?.id ?? "anon"}:${examId}`,
      BULK_GRADE_CHAT_RATE_LIMIT,
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    const access = await requireBulkGradeAccess(examId, user);
    if (!access.ok) return access.response;

    const supabase = getSupabaseServer();

    // Load all student case data
    let examCaseData;
    try {
      examCaseData = await loadExamCaseData(supabase, examId);
    } catch (err) {
      logError("bulk-grade chat: loadExamCaseData failed", err, {
        path: `/api/exam/${examId}/bulk-grade/chat`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to load exam data", 500);
    }

    if (examCaseData.caseQuestions.length === 0) {
      return errorJson("VALIDATION_ERROR", "채점할 케이스 문제가 없습니다.", 400);
    }

    if (examCaseData.students.length === 0) {
      return errorJson("VALIDATION_ERROR", "채점할 학생 답안이 없습니다.", 400);
    }

    const validSessionIds = new Set(examCaseData.students.map((s) => s.sessionId));
    const validQIdxes = new Set(examCaseData.caseQuestions.map((q) => q.qIdx));

    // Upsert grading session
    const { data: gradingSession, error: upsertError } = await supabase
      .from("exam_grading_sessions")
      .upsert(
        {
          exam_id: examId,
          instructor_id: access.ctx.user.id,
          status: "draft",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "exam_id,instructor_id" },
      )
      .select("id, proposed_grades")
      .single();

    if (upsertError || !gradingSession) {
      logError("bulk-grade chat: session upsert failed", upsertError, {
        path: `/api/exam/${examId}/bulk-grade/chat`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to initialize grading session", 500);
    }

    const gradingSessionId = gradingSession.id as string;
    const currentProposedGrades = (gradingSession.proposed_grades ?? {}) as Record<string, unknown>;

    // Save user message
    const { error: userMsgError } = await supabase
      .from("bulk_grading_messages")
      .insert({
        session_id: gradingSessionId,
        role: "user",
        content: message,
        created_by: access.ctx.user.id,
      });

    if (userMsgError) {
      logError("bulk-grade chat: save user message failed", userMsgError, {
        path: `/api/exam/${examId}/bulk-grade/chat`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to save message", 500);
    }

    // Load chat history for OpenAI context
    const { data: historyRows } = await supabase
      .from("bulk_grading_messages")
      .select("role, content")
      .eq("session_id", gradingSessionId)
      .order("created_at", { ascending: true });

    const systemPrompt = buildBulkGradingSystemPrompt({
      examTitle: examCaseData.examTitle,
      examDescription: examCaseData.examDescription,
      caseQuestions: examCaseData.caseQuestions,
      students: examCaseData.students,
      language: examCaseData.examLanguage,
    });

    // Token pre-check
    const estimatedTokens = estimateTokenCount(systemPrompt);
    if (estimatedTokens > GPT4O_MAX_TOKENS * CONTEXT_WARN_RATIO) {
      return errorJson(
        "CONTEXT_TOO_LARGE",
        `학생 수 또는 답안 길이가 너무 많습니다 (추정 ${estimatedTokens.toLocaleString()} 토큰). 시험을 분리하거나 답안 수를 줄이세요.`,
        413,
      );
    }

    const openAiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    for (const row of historyRows ?? []) {
      if (row.role === "user" || row.role === "assistant") {
        openAiMessages.push({ role: row.role, content: row.content as string });
      }
    }

    // Call OpenAI
    let aiContent: string;
    try {
      const tracked = await callTrackedChatCompletion(
        () =>
          getOpenAI().chat.completions.create({
            model: AI_MODEL,
            messages: openAiMessages,
            max_completion_tokens: 4000,
          }),
        {
          feature: "bulk_grading_chat",
          route: `/api/exam/${examId}/bulk-grade/chat`,
          model: AI_MODEL,
          userId: access.ctx.user.id,
          examId,
          metadata: buildAiTextMetadata({
            inputText: [systemPrompt, message],
            extra: { studentCount: examCaseData.students.length },
          }),
        },
        {
          metadataBuilder: (result) =>
            buildAiTextMetadata({
              outputText:
                (
                  result as {
                    choices?: Array<{ message?: { content?: string | null } }>;
                  }
                ).choices?.[0]?.message?.content ?? null,
            }),
        },
      );

      aiContent = tracked.data.choices[0]?.message?.content?.trim() || "";
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : "";
      if (errMessage.includes("context_length_exceeded")) {
        return errorJson(
          "CONTEXT_TOO_LARGE",
          "학생 답안이 너무 많아 AI가 처리할 수 없습니다. 학생 수가 많은 경우 시험을 분리해 채점하세요.",
          413,
        );
      }
      logError("bulk-grade chat: OpenAI call failed", err, {
        path: `/api/exam/${examId}/bulk-grade/chat`,
      });
      return errorJson("INTERNAL_ERROR", "AI 응답을 받지 못했습니다. 다시 시도해주세요.", 500);
    }

    if (!aiContent) {
      return errorJson("INTERNAL_ERROR", "AI 응답이 비어있습니다. 다시 시도해주세요.", 500);
    }

    // Parse grades from AI response
    const parsedGrades = parseGradesFromAiResponse(aiContent, validSessionIds, validQIdxes);
    const proposedGrades = parsedGrades
      ? buildProposedGradesMap(parsedGrades)
      : (currentProposedGrades as ReturnType<typeof buildProposedGradesMap>);

    // Save assistant message + update proposed_grades
    const [assistantMsgResult] = await Promise.all([
      supabase
        .from("bulk_grading_messages")
        .insert({
          session_id: gradingSessionId,
          role: "assistant",
          content: aiContent,
          created_by: access.ctx.user.id,
        })
        .select("id, role, content")
        .single(),
      supabase
        .from("exam_grading_sessions")
        .update({
          proposed_grades: proposedGrades,
          status: "draft",
          updated_at: new Date().toISOString(),
        })
        .eq("id", gradingSessionId),
    ]);

    if (assistantMsgResult.error || !assistantMsgResult.data) {
      logError("bulk-grade chat: save assistant message failed", assistantMsgResult.error, {
        path: `/api/exam/${examId}/bulk-grade/chat`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to save assistant message", 500);
    }

    const warning =
      examCaseData.students.length > 40
        ? `학생 수가 ${examCaseData.students.length}명으로 많아 채점에 시간이 걸렸습니다.`
        : null;

    return successJson({
      assistantMessage: {
        id: assistantMsgResult.data.id,
        role: assistantMsgResult.data.role,
        content: assistantMsgResult.data.content,
      },
      proposedGrades: parsedGrades ? proposedGrades : null,
      warning,
    });
  } catch (error) {
    logError("bulk-grade chat POST handler error", error, {
      path: "/api/exam/bulk-grade/chat",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
