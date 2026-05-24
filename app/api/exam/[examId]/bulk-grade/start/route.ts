export const maxDuration = 60;

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getOpenAI, AI_MODEL } from "@/lib/openai";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { requireBulkGradeAccess } from "@/lib/bulk-grade-access";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  isQStashEnabled,
  enqueueBulkGradeJobs,
  type BulkGradeJobPayload,
} from "@/lib/qstash";
import {
  buildCriteriaExtractionSystemPrompt,
  type ExtractedCriteria,
} from "@/lib/prompts";
import { loadExamMetaOnly } from "@/lib/bulk-grading";

const BULK_GRADE_START_RATE_LIMIT = { limit: 3, windowSec: 60 };
const STALE_GRADING_MS = 10 * 60 * 1000;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const { examId } = await params;
    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    const user = await currentUser();

    const rl = await checkRateLimitAsync(
      `bulk-grade-start:${user?.id ?? "anon"}:${examId}`,
      BULK_GRADE_START_RATE_LIMIT,
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    const access = await requireBulkGradeAccess(examId, user);
    if (!access.ok) return access.response;

    const supabase = getSupabaseServer();

    // Check for existing grading session
    const { data: existingSession } = await supabase
      .from("exam_grading_sessions")
      .select("id, status, updated_at")
      .eq("exam_id", examId)
      .eq("instructor_id", access.ctx.user.id)
      .maybeSingle();

    if (existingSession?.status === "grading") {
      const updatedAt = existingSession.updated_at
        ? new Date(existingSession.updated_at as string).getTime()
        : 0;
      const isStale = Date.now() - updatedAt > STALE_GRADING_MS;
      if (!isStale) {
        return errorJson("CONFLICT", "채점이 이미 진행 중입니다. 잠시 후 확인해주세요.", 409);
      }
    }

    // Load exam meta + submitted sessions
    const [examMeta, sessionsResult] = await Promise.all([
      loadExamMetaOnly(supabase, examId),
      supabase
        .from("sessions")
        .select("id")
        .eq("exam_id", examId)
        .not("submitted_at", "is", null),
    ]);

    if (examMeta.caseQuestions.length === 0) {
      return errorJson("VALIDATION_ERROR", "채점할 케이스 문제가 없습니다.", 400);
    }

    if (sessionsResult.error || !sessionsResult.data?.length) {
      return errorJson("VALIDATION_ERROR", "제출한 학생이 없습니다.", 400);
    }

    const studentSessionIds = (sessionsResult.data ?? []).map((s) => s.id as string);

    // Load chat history for criteria extraction
    const sessionUpsertResult = await supabase
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
      .select("id")
      .single();

    if (sessionUpsertResult.error || !sessionUpsertResult.data) {
      return errorJson("INTERNAL_ERROR", "Failed to initialize grading session", 500);
    }

    const gradingSessionId = sessionUpsertResult.data.id as string;

    const { data: chatMessages } = await supabase
      .from("bulk_grading_messages")
      .select("role, content")
      .eq("session_id", gradingSessionId)
      .order("created_at", { ascending: true });

    const historyText = (chatMessages ?? [])
      .map((m) => `${m.role === "user" ? "Instructor" : "AI"}: ${m.content}`)
      .join("\n\n");

    // Extract grading criteria via small AI call
    let criteria: ExtractedCriteria = {
      criteria_summary: historyText || "전반적인 논리적 완성도와 개념 이해를 기준으로 채점",
      per_question: [],
    };

    try {
      const criteriaResponse = await getOpenAI().chat.completions.create({
        model: AI_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: buildCriteriaExtractionSystemPrompt(examMeta.examLanguage) },
          { role: "user", content: historyText || "(채팅 기록 없음)" },
        ],
        max_completion_tokens: 800,
      });

      const criteriaText = criteriaResponse.choices[0]?.message?.content?.trim() ?? "";
      if (criteriaText) {
        const jsonMatch = criteriaText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Partial<ExtractedCriteria>;
          if (parsed.criteria_summary) {
            criteria = {
              criteria_summary: parsed.criteria_summary,
              per_question: parsed.per_question ?? [],
            };
          }
        }
      }
    } catch (criteriaError) {
      logError("bulk-grade start: criteria extraction failed", criteriaError, {
        path: `/api/exam/${examId}/bulk-grade/start`,
      });
      // fallback criteria already set above
    }

    // Update session: criteria + progress tracking
    const { error: updateError } = await supabase
      .from("exam_grading_sessions")
      .update({
        grading_criteria: JSON.stringify(criteria),
        grading_total: studentSessionIds.length,
        grading_completed: 0,
        grading_failed_count: 0,
        expected_session_ids: studentSessionIds,
        status: "grading",
        updated_at: new Date().toISOString(),
      })
      .eq("id", gradingSessionId);

    if (updateError) {
      logError("bulk-grade start: session update failed", updateError, {
        path: `/api/exam/${examId}/bulk-grade/start`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to start grading session", 500);
    }

    // Dev fallback: no QStash → inline sequential (non-Vercel only)
    if (!isQStashEnabled()) {
      if (process.env.VERCEL) {
        return errorJson(
          "INTERNAL_ERROR",
          "QStash가 설정되지 않았습니다. 환경 변수를 확인해주세요.",
          500,
        );
      }
      // Dev: run inline (import lazily to avoid bundling in prod)
      await runBulkGradeInline(gradingSessionId, studentSessionIds, examId);
      return successJson({ ok: true, total: studentSessionIds.length, mode: "inline" });
    }

    // Enqueue QStash jobs
    const jobs: BulkGradeJobPayload[] = studentSessionIds.map((sid) => ({
      gradingSessionId,
      studentSessionId: sid,
      examId,
    }));

    const { published, failed: publishFailed } = await enqueueBulkGradeJobs(jobs);

    // Compensate for publish failures: pre-increment failed counter
    if (publishFailed > 0) {
      await supabase.rpc("merge_bulk_grading_result", {
        p_session_id: gradingSessionId,
        p_student_sid: `__publish_failed_${Date.now()}`,
        p_grades_json: {},
        p_success: false,
      });
      // For multiple failures, call RPC multiple times
      for (let i = 1; i < publishFailed; i++) {
        await supabase.rpc("merge_bulk_grading_result", {
          p_session_id: gradingSessionId,
          p_student_sid: `__publish_failed_${Date.now()}_${i}`,
          p_grades_json: {},
          p_success: false,
        });
      }
    }

    return successJson({ ok: true, total: studentSessionIds.length, published });
  } catch (error) {
    logError("bulk-grade start POST handler error", error, {
      path: "/api/exam/bulk-grade/start",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}

async function runBulkGradeInline(
  gradingSessionId: string,
  studentSessionIds: string[],
  examId: string,
): Promise<void> {
  // Dev-only: simulate worker calls sequentially
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  for (const sid of studentSessionIds) {
    try {
      await fetch(`${baseUrl}/api/internal/bulk-grade-worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gradingSessionId, studentSessionId: sid, examId }),
      });
    } catch (err) {
      logError("bulk-grade inline: worker call failed", err, {
        path: "bulk-grade/start inline",
        additionalData: { sid },
      });
    }
  }
}
