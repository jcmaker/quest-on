import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentUser } from "@clerk/nextjs/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Update submission with student reply using sessionId and qIdx
export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();
  try {
    // Authentication check
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const { studentReply, sessionId, qIdx } = body;

    if (!studentReply || !sessionId || qIdx === undefined) {
      return NextResponse.json(
        { error: "Student reply, sessionId, and qIdx are required" },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      return NextResponse.json(
        { error: "Invalid session ID format" },
        { status: 400 }
      );
    }

    // Verify session ownership
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, student_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.student_id !== user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
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
      return NextResponse.json(
        { error: "Failed to check submission", details: checkError.message },
        { status: 500 }
      );
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
      console.error("Submission database error:", {
        code: error.code,
        message: error.message,
      });
      return NextResponse.json(
        { error: "Failed to save submission" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Submission operation failed" },
        { status: 404 }
      );
    }

    const requestDuration = Date.now() - requestStartTime;
    console.log(
      `[SUBMISSION] Reply saved | Session: ${sessionId} | Q: ${qIdx} | ${requestDuration}ms`
    );

    return NextResponse.json({
      success: true,
      submission: data,
    });
  } catch (error) {
    const requestDuration = Date.now() - requestStartTime;
    console.error("Submission update error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      duration: requestDuration,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
