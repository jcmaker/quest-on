import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";

const supabase = getSupabaseServer();

// Update submission with student reply (by submissionId)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    // Authentication check
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const { submissionId } = await params;

    const invalidId = validateUUID(submissionId, "submissionId");
    if (invalidId) return invalidId;

    const { studentReply, sessionId, qIdx, expectedUpdatedAt } =
      await request.json();

    if (!studentReply) {
      return errorJson("MISSING_REPLY", "Student reply is required", 400);
    }

    // Verify ownership: check that the session belongs to this user
    const targetSessionId = sessionId;
    if (targetSessionId) {
      const { data: session } = await supabase
        .from("sessions")
        .select("student_id")
        .eq("id", targetSessionId)
        .single();

      if (!session || session.student_id !== user.id) {
        return errorJson("ACCESS_DENIED", "Access denied", 403);
      }
    }

    let data, error;
    const updatePayload = {
      student_reply: studentReply,
      updated_at: new Date().toISOString(),
    };

    if (sessionId !== undefined && qIdx !== undefined) {
      let query = supabase
        .from("submissions")
        .update(updatePayload)
        .eq("session_id", sessionId)
        .eq("q_idx", qIdx);

      // Optimistic locking: only update if updated_at matches
      if (expectedUpdatedAt) {
        query = query.eq("updated_at", expectedUpdatedAt);
      }

      const result = await query.select().single();
      data = result.data;
      error = result.error;
    } else {
      // Verify ownership via submission's session
      const { data: submission } = await supabase
        .from("submissions")
        .select("session_id")
        .eq("id", submissionId)
        .single();

      if (submission) {
        const { data: session } = await supabase
          .from("sessions")
          .select("student_id")
          .eq("id", submission.session_id)
          .single();

        if (!session || session.student_id !== user.id) {
          return errorJson("ACCESS_DENIED", "Access denied", 403);
        }
      }

      let query = supabase
        .from("submissions")
        .update(updatePayload)
        .eq("id", submissionId);

      if (expectedUpdatedAt) {
        query = query.eq("updated_at", expectedUpdatedAt);
      }

      const result = await query.select().single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      // PGRST116 = no rows returned (optimistic lock conflict)
      if (error.code === "PGRST116" && expectedUpdatedAt) {
        return errorJson(
          "CONFLICT",
          "Submission was modified concurrently. Please refresh and try again.",
          409
        );
      }
      return errorJson(
        "UPDATE_SUBMISSION_FAILED",
        "Failed to update submission",
        500
      );
    }

    return successJson({ submission: data });
  } catch (error) {
    return errorJson("INTERNAL_SERVER_ERROR", "Internal server error", 500);
  }
}
