export const maxDuration = 60;

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
import { loadExamMetaOnly } from "@/lib/bulk-grading";
import { buildCriteriaDiscussionSystemPrompt } from "@/lib/prompts";
import { getSupabaseServer } from "@/lib/supabase-server";

const BULK_GRADE_CHAT_RATE_LIMIT = { limit: 10, windowSec: 60 };

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

    const access = await requireBulkGradeAccess(examId, user, {
      requireClosed: true,
    });
    if (!access.ok) return access.response;

    const supabase = getSupabaseServer();

    // Load exam meta (no student data — fast)
    let examMeta;
    try {
      examMeta = await loadExamMetaOnly(supabase, examId);
    } catch {
      return errorJson("INTERNAL_ERROR", "Failed to load exam data", 500);
    }

    if (examMeta.caseQuestions.length === 0) {
      return errorJson("VALIDATION_ERROR", "채점할 케이스 문제가 없습니다.", 400);
    }

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
      .select("id, status")
      .single();

    if (upsertError || !gradingSession) {
      return errorJson("INTERNAL_ERROR", "Failed to initialize grading session", 500);
    }

    const gradingSessionId = gradingSession.id as string;

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
      return errorJson("INTERNAL_ERROR", "Failed to save message", 500);
    }

    // Load chat history
    const { data: historyRows } = await supabase
      .from("bulk_grading_messages")
      .select("role, content")
      .eq("session_id", gradingSessionId)
      .order("created_at", { ascending: true });

    // Build criteria discussion prompt (no student data)
    const systemPrompt = buildCriteriaDiscussionSystemPrompt({
      examTitle: examMeta.examTitle,
      examDescription: examMeta.examDescription,
      caseQuestions: examMeta.caseQuestions,
      language: examMeta.examLanguage,
    });

    const openAiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];
    for (const row of historyRows ?? []) {
      if (row.role === "user" || row.role === "assistant") {
        openAiMessages.push({ role: row.role, content: row.content as string });
      }
    }

    const tracked = await callTrackedChatCompletion(
      () =>
        getOpenAI().chat.completions.create({
          model: AI_MODEL,
          messages: openAiMessages,
          max_completion_tokens: 2000,
        }),
      {
        feature: "bulk_grading_chat",
        route: `/api/exam/${examId}/bulk-grade/chat`,
        model: AI_MODEL,
        userId: access.ctx.user.id,
        examId,
        metadata: buildAiTextMetadata({ inputText: [systemPrompt, message] }),
      },
      {
        metadataBuilder: (result) =>
          buildAiTextMetadata({
            outputText:
              (result as { choices?: Array<{ message?: { content?: string | null } }> })
                .choices?.[0]?.message?.content ?? null,
          }),
      },
    );

    const aiContent = tracked.data.choices[0]?.message?.content?.trim() ?? "";
    if (!aiContent) {
      return errorJson("INTERNAL_ERROR", "AI 응답을 받지 못했습니다.", 500);
    }

    // Save assistant message
    const { data: assistantRow, error: assistantError } = await supabase
      .from("bulk_grading_messages")
      .insert({
        session_id: gradingSessionId,
        role: "assistant",
        content: aiContent,
        created_by: access.ctx.user.id,
      })
      .select("id, role, content")
      .single();

    if (assistantError || !assistantRow) {
      logError("bulk-grade chat: save assistant message failed", assistantError, {
        path: `/api/exam/${examId}/bulk-grade/chat`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to save assistant message", 500);
    }

    // canStartGrading: at least one user+assistant exchange
    const canStartGrading = (historyRows?.length ?? 0) >= 2;

    return successJson({
      assistantMessage: {
        id: assistantRow.id,
        role: assistantRow.role,
        content: assistantRow.content,
      },
      canStartGrading,
    });
  } catch (error) {
    logError("bulk-grade chat POST handler error", error, {
      path: "/api/exam/bulk-grade/chat",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
