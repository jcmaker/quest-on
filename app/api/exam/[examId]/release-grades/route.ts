import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

/** POST: 성적 공개 (grades_released = true) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;

    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    const rl = await checkRateLimitAsync(`release-grades:${user.id}`, RATE_LIMITS.examControl);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const supabase = getSupabaseServer();

    const { data: exam, error } = await supabase
      .from("exams")
      .update({ grades_released: true })
      .eq("id", examId)
      .eq("instructor_id", user.id)
      .select("id, grades_released")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorJson("EXAM_NOT_FOUND", "Exam not found or access denied", 404);
      }
      throw error;
    }

    return successJson({ exam });
  } catch {
    return errorJson("RELEASE_GRADES_FAILED", "Failed to release grades", 500);
  }
}

/** DELETE: 성적 비공개 복원 (grades_released = false) */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;

    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    const rl = await checkRateLimitAsync(`release-grades:${user.id}`, RATE_LIMITS.examControl);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const supabase = getSupabaseServer();

    const { data: exam, error } = await supabase
      .from("exams")
      .update({ grades_released: false })
      .eq("id", examId)
      .eq("instructor_id", user.id)
      .select("id, grades_released")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorJson("EXAM_NOT_FOUND", "Exam not found or access denied", 404);
      }
      throw error;
    }

    return successJson({ exam });
  } catch {
    return errorJson("UNRELEASE_GRADES_FAILED", "Failed to unrelease grades", 500);
  }
}
