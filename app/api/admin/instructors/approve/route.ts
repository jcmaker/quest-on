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

    // Update Clerk unsafeMetadata
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (clerkSecretKey) {
      const clerkRes = await fetch(
        `https://api.clerk.com/v1/users/${instructorId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${clerkSecretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            unsafe_metadata: {
              role: "instructor",
              status: "approved",
            },
          }),
        }
      );
      if (!clerkRes.ok) {
        logError("[approve-instructor] Clerk update failed", await clerkRes.text(), {
          path: "/api/admin/instructors/approve",
        });
      }
    }

    return successJson({ approved: true });
  } catch (error) {
    logError("[approve-instructor] Unhandled error", error, {
      path: "/api/admin/instructors/approve",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
