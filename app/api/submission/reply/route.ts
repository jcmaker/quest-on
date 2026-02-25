import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";

const supabase = getSupabaseServer();

// Update submission with student reply using sessionId and qIdx
export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();
  try {
    // Authentication check
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const body = await request.json();

    const { studentReply, sessionId, qIdx } = body;

    if (!studentReply || !sessionId || qIdx === undefined) {
      return errorJson("MISSING_FIELDS", "Student reply, sessionId, and qIdx are required", 400);
    }

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      return errorJson("INVALID_SESSION_ID", "Invalid session ID format", 400);
    }

    // Verify session ownership
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, student_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== user.id) {
      return errorJson("ACCESS_DENIED", "Access denied", 403);
    }

    // Sanitize HTML - remove null characters
    const sanitizedReply = studentReply.replace(/\u0000/g, "");

    // Check if submission exists (get the most recent one if multiple exist)
    const { data: existingSubmissions, error: checkError } = await supabase
      .from("submissions")
      .select("id")
      .eq("session_id", sessionId)
      .eq("q_idx", qIdx)
      .order("created_at", { ascending: false })
      .limit(1);

    const existingSubmission =
      existingSubmissions && existingSubmissions.length > 0
        ? existingSubmissions[0]
        : null;

    if (checkError) {
      return errorJson("CHECK_SUBMISSION_FAILED", "Failed to check submission", 500, checkError.message);
    }

    let data;
    let error;

    if (existingSubmission) {
      const result = await supabase
        .from("submissions")
        .update({
          student_reply: sanitizedReply,
        })
        .eq("id", existingSubmission.id)
        .select()
        .single();

      data = result.data;
      error = result.error;
    } else {
      const result = await supabase
        .from("submissions")
        .insert({
          session_id: sessionId,
          q_idx: qIdx,
          student_reply: sanitizedReply,
          answer: "",
        })
        .select()
        .single();

      data = result.data;
      error = result.error;
    }

    if (error) {
      return errorJson("SAVE_SUBMISSION_FAILED", "Failed to save submission", 500);
    }

    if (!data) {
      return errorJson("SUBMISSION_OPERATION_FAILED", "Submission operation failed", 404);
    }

    return successJson({ submission: data });
  } catch (error) {
    return errorJson("INTERNAL_SERVER_ERROR", "Internal server error", 500);
  }
}
