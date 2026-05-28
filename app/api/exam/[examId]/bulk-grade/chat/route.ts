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
import {
  CALIBRATION_SAMPLE_SIZE,
  loadCalibrationSampleData,
  loadExamMetaOnly,
  selectCalibrationSampleSessionIds,
} from "@/lib/bulk-grading";
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

    const isInit = "init" in validation.data && validation.data.init === true;
    const message = isInit ? "" : (validation.data as { message: string }).message;

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

    const { data: submittedSessions, error: submittedError } = await supabase
      .from("sessions")
      .select("id")
      .eq("exam_id", examId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: true });

    if (submittedError || !submittedSessions?.length) {
      return errorJson("VALIDATION_ERROR", "제출한 학생이 없습니다.", 400);
    }

    const submittedIds = submittedSessions.map((s) => s.id as string);
    const { data: currentSession } = await supabase
      .from("exam_grading_sessions")
      .select("id, status, calibration_status, calibration_sample_session_ids")
      .eq("exam_id", examId)
      .eq("instructor_id", access.ctx.user.id)
      .maybeSingle();

    if (currentSession?.status === "grading" || currentSession?.status === "committing") {
      return errorJson("CONFLICT", "채점이 진행 중입니다. 완료 후 기준을 수정하세요.", 409);
    }
    if (currentSession?.calibration_status === "sample_grading") {
      return errorJson("CONFLICT", "샘플 가채점이 진행 중입니다. 완료 후 기준을 수정하세요.", 409);
    }
    if (currentSession?.status === "committed") {
      return errorJson("CONFLICT", "이미 확정된 채점입니다.", 409);
    }

    const sampleSessionIds = selectCalibrationSampleSessionIds(
      submittedIds,
      currentSession?.calibration_sample_session_ids,
      CALIBRATION_SAMPLE_SIZE,
    );

    // Upsert grading session and mark the calibration criteria as being edited.
    const { data: gradingSession, error: upsertError } = await supabase
      .from("exam_grading_sessions")
      .upsert(
        {
          exam_id: examId,
          instructor_id: access.ctx.user.id,
          status: "draft",
          calibration_status: "interviewing",
          calibration_sample_session_ids: sampleSessionIds,
          calibration_sample_grades: {},
          proposed_grades: {},
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

    // init 모드: 이미 assistant 메시지가 있으면 중복 생성 방지
    if (isInit) {
      const { data: existingMessages } = await supabase
        .from("bulk_grading_messages")
        .select("id")
        .eq("session_id", gradingSessionId)
        .eq("role", "assistant")
        .limit(1);
      if (existingMessages && existingMessages.length > 0) {
        return errorJson("CONFLICT", "인터뷰가 이미 시작됐습니다.", 409);
      }
    }

    // init 모드가 아닐 때만 강사 메시지 저장
    if (!isInit) {
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
    }

    // Load chat history
    const { data: historyRows } = await supabase
      .from("bulk_grading_messages")
      .select("role, content")
      .eq("session_id", gradingSessionId)
      .order("created_at", { ascending: true });

    const caseQIdxes = examMeta.caseQuestions.map((q) => q.qIdx);
    const sampleStudents = await loadCalibrationSampleData(
      supabase,
      sampleSessionIds,
      caseQIdxes,
    );
    const sampleStudentsWithPrompts = sampleStudents.map((student) => ({
      ...student,
      answers: student.answers.map((answer) => ({
        ...answer,
        questionPrompt:
          examMeta.caseQuestions.find((q) => q.qIdx === answer.qIdx)?.questionPrompt ?? "",
      })),
    }));

    // Build criteria discussion prompt with fixed sample student data.
    const systemPrompt = buildCriteriaDiscussionSystemPrompt({
      examTitle: examMeta.examTitle,
      examDescription: examMeta.examDescription,
      caseQuestions: examMeta.caseQuestions,
      sampleStudents: sampleStudentsWithPrompts,
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
        metadata: buildAiTextMetadata({ inputText: [systemPrompt, ...(isInit ? [] : [message])] }),
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

    // canStartGrading: 강사가 최소 1회 발화했을 때 (init AI 질문만으로는 불충분)
    const canStartGrading =
      (historyRows ?? []).filter((r) => r.role === "user").length >= 1;

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
