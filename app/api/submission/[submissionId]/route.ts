import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@clerk/nextjs/server";
import { successJson, errorJson } from "@/lib/api-response";

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
    const { studentReply, sessionId, qIdx } = await request.json();

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

    if (sessionId !== undefined && qIdx !== undefined) {
      const result = await supabase
        .from("submissions")
        .update({ student_reply: studentReply })
        .eq("session_id", sessionId)
        .eq("q_idx", qIdx)
        .select()
        .single();

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

      const result = await supabase
        .from("submissions")
        .update({ student_reply: studentReply })
        .eq("id", submissionId)
        .select()
        .single();

      data = result.data;
      error = result.error;
    }

    if (error) {
      return errorJson("UPDATE_SUBMISSION_FAILED", "Failed to update submission", 500);
    }

    return successJson({ submission: data });
  } catch (error) {
    return errorJson("INTERNAL_SERVER_ERROR", "Internal server error", 500);
  }
}
