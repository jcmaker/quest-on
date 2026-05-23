import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { bulkGradeCommitSchema, validateRequest } from "@/lib/validations";
import { upsertGradesBySessionQuestion } from "@/lib/grades-upsert";
import { requireBulkGradeAccess } from "@/lib/bulk-grade-access";
import { getSupabaseServer } from "@/lib/supabase-server";

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
    const validation = validateRequest(bulkGradeCommitSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error, 400);
    }

    const { grades } = validation.data;

    const rl = await checkRateLimitAsync(
      `bulk-grade-commit:${user?.id ?? "anon"}:${examId}`,
      RATE_LIMITS.general,
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    const access = await requireBulkGradeAccess(examId, user);
    if (!access.ok) return access.response;

    const supabase = getSupabaseServer();

    // [QA CRITICAL] 2-step ownership check:
    // Step 1 — exam.instructor_id === user.id (done by requireBulkGradeAccess)
    // Step 2 — all session_ids in grades belong to this exam
    const uniqueSessionIds = [...new Set(grades.map((g) => g.session_id))];
    const { data: validSessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id")
      .in("id", uniqueSessionIds)
      .eq("exam_id", examId);

    if (sessionsError) {
      logError("bulk-grade commit: session ownership check failed", sessionsError, {
        path: `/api/exam/${examId}/bulk-grade/commit`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to verify sessions", 500);
    }

    if ((validSessions?.length ?? 0) !== uniqueSessionIds.length) {
      return errorJson(
        "FORBIDDEN",
        "One or more session IDs do not belong to this exam",
        403,
      );
    }

    // [QA HIGH-3 idempotency] — only commit if status is 'draft'
    const { data: updatedSession, error: statusError } = await supabase
      .from("exam_grading_sessions")
      .update({ status: "committed", committed_at: new Date().toISOString() })
      .eq("exam_id", examId)
      .eq("instructor_id", access.ctx.user.id)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();

    if (statusError) {
      logError("bulk-grade commit: status update failed", statusError, {
        path: `/api/exam/${examId}/bulk-grade/commit`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to update grading session", 500);
    }

    if (!updatedSession) {
      // Already committed — idempotent response
      return successJson({ ok: true, gradedCount: grades.length, alreadyCommitted: true });
    }

    // Upsert grades
    const gradeRows = grades.map((g) => ({
      session_id: g.session_id,
      q_idx: g.q_idx,
      score: Math.min(100, Math.max(0, g.score)),
      comment: g.comment ?? "",
      stage_grading: {
        answer: {
          score: g.score,
          comment: g.comment ?? "",
        },
      },
      grade_type: "manual",
    }));

    await upsertGradesBySessionQuestion(
      supabase as never,
      gradeRows,
      "bulk_grade_commit",
    );

    try {
      await auditLog({
        action: "grade_bulk_commit",
        userId: access.ctx.user.id,
        targetId: examId,
        details: {
          gradedCount: grades.length,
          sessionIds: uniqueSessionIds.slice(0, 10),
          source: "bulk_grade_commit",
        },
      });
    } catch (auditError) {
      logError("[bulk-grade commit] Audit log failed", auditError, {
        path: `/api/exam/${examId}/bulk-grade/commit`,
      });
    }

    return successJson({ ok: true, gradedCount: grades.length });
  } catch (error) {
    logError("bulk-grade commit POST handler error", error, {
      path: "/api/exam/bulk-grade/commit",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
