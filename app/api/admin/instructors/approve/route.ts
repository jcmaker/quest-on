import { getSupabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const { instructorId } = await request.json();
    if (!instructorId) {
      return errorJson("BAD_REQUEST", "instructorId is required", 400);
    }

    const supabase = getSupabaseServer();

    // instructor_profiles 테이블 상태 업데이트
    const { error: dbError } = await supabase
      .from("instructor_profiles")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", instructorId);

    if (dbError) {
      logError("[approve-instructor] DB error", dbError, {
        path: "/api/admin/instructors/approve",
      });
      return errorJson("DATABASE_ERROR", "Failed to update status", 500);
    }

    // profiles 테이블 status 업데이트 (JWT 클레임 반영)
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", instructorId);

    if (profileError) {
      logError("[approve-instructor] Profile update error", profileError, {
        path: "/api/admin/instructors/approve",
      });
      // non-fatal: instructor_profiles already updated
    }

    return successJson({ approved: true });
  } catch (error) {
    logError("[approve-instructor] Unhandled error", error, {
      path: "/api/admin/instructors/approve",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
