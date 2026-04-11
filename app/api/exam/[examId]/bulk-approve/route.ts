import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { bulkApproveSchema } from "@/lib/validations";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;

    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    // 1. Auth check
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // 2. Rate limit
    const rl = await checkRateLimitAsync(`bulk-approve:${user.id}`, RATE_LIMITS.submission);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    // 3. Input validation
    const body = await request.json();
    const parsed = bulkApproveSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return errorJson(
        "INVALID_INPUT",
        firstError ? `${firstError.path.join(".")}: ${firstError.message}` : "Invalid request body",
        400
      );
    }
    const { sessionIds } = parsed.data;

    // 4. Ownership check
    const supabase = getSupabaseServer();
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("instructor_id")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // 5. Verify sessions belong to this exam
    const { data: validSessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id")
      .eq("exam_id", examId)
      .in("id", sessionIds);

    if (sessionsError) {
      return errorJson("INTERNAL_ERROR", "Failed to verify sessions", 500);
    }

    const validSessionIds = (validSessions || []).map((s) => s.id);
    if (validSessionIds.length === 0) {
      return errorJson("NOT_FOUND", "No valid sessions found for this exam", 404);
    }

    // 6. Bulk update: promote auto grades to manual (instructor-approved)
    const { count, error: updateError } = await supabase
      .from("grades")
      .update({ grade_type: "manual" }, { count: "exact" })
      .in("session_id", validSessionIds)
      .eq("grade_type", "auto");

    if (updateError) {
      console.error("[BULK_APPROVE] Failed to update grades:", updateError);
      return errorJson("INTERNAL_ERROR", "Failed to approve grades", 500);
    }

    return successJson({ approvedCount: count ?? 0 });
  } catch (error) {
    console.error("[BULK_APPROVE] Unexpected error:", error);
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
