import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Update submission with student reply using sessionId and qIdx
export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();
  try {
    const body = await request.json();
    console.log("📨 Received request body:", {
      hasStudentReply: !!body.studentReply,
      hasSessionId: !!body.sessionId,
      hasQIdx: body.qIdx !== undefined,
      studentReplyLength: body.studentReply?.length,
    });

    console.log(
      `📝 [SUBMISSION] Student reply attempt | Session: ${body.sessionId} | Question: ${body.qIdx}`
    );

    const { studentReply, sessionId, qIdx } = body;

    if (!studentReply || !sessionId || qIdx === undefined) {
      console.error("❌ Missing required fields:", {
        studentReply: !!studentReply,
        sessionId: !!sessionId,
        qIdx,
      });
      return NextResponse.json(
        { error: "Student reply, sessionId, and qIdx are required" },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      console.error("❌ Invalid sessionId format:", sessionId);
      return NextResponse.json(
        {
          error: "Invalid session ID format",
          details: `Session ID must be a valid UUID. Received: ${sessionId}`,
        },
        { status: 400 }
      );
    }

    console.log("✅ All required fields present. Processing:", {
      sessionId,
      qIdx,
      studentReplyLength: studentReply.length,
    });

    // Sanitize HTML - remove null characters
    const sanitizedReply = studentReply.replace(/\u0000/g, "");
    console.log("🧹 Sanitized reply length:", sanitizedReply.length);

    // Check if submission exists (get the most recent one if multiple exist)
    console.log("🔍 Checking for existing submission...");
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
      console.error("❌ Error checking submission:", checkError);
      return NextResponse.json(
        { error: "Failed to check submission", details: checkError.message },
        { status: 500 }
      );
    }

    console.log(
      "📋 Existing submission:",
      existingSubmission ? `Found (id: ${existingSubmission.id})` : "Not found"
    );

    let data;
    let error;

    if (existingSubmission) {
      // Update existing submission (by ID to ensure we update only one)
      console.log(
        "📝 Updating existing submission with ID:",
        existingSubmission.id
      );
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

      if (error) {
        console.error("❌ Update failed:", error);
      } else {
        console.log("✅ Update successful");
      }
    } else {
      // Create new submission with student reply
      console.log("➕ Creating new submission...");
      const result = await supabase
        .from("submissions")
        .insert({
          session_id: sessionId,
          q_idx: qIdx,
          student_reply: sanitizedReply,
          answer: "", // Empty answer for now
        })
        .select()
        .single();

      data = result.data;
      error = result.error;

      if (error) {
        console.error("❌ Insert failed:", error);
      } else {
        console.log("✅ Insert successful");
      }
    }

    if (error) {
      console.error("❌ Database operation failed:", {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return NextResponse.json(
        {
          error: "Failed to save submission",
          details: error.message,
          code: error.code,
          hint: error.hint,
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Submission operation failed" },
        { status: 404 }
      );
    }

    console.log("Submission updated successfully:", data);

    const requestDuration = Date.now() - requestStartTime;
    console.log(
      `⏱️  [PERFORMANCE] Submission reply saved in ${requestDuration}ms`
    );
    console.log(
      `✅ [SUCCESS] Student reply saved | Session: ${sessionId} | Question: ${qIdx} | Length: ${sanitizedReply.length} chars`
    );

    return NextResponse.json({
      success: true,
      submission: data,
    });
  } catch (error) {
    const requestDuration = Date.now() - requestStartTime;
    console.error("❌ Submission update error (caught exception):", {
      error,
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.error(
      `❌ [ERROR] Submission reply failed after ${requestDuration}ms`
    );
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
