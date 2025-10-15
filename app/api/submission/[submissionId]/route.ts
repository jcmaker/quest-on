import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Update submission with student reply (by submissionId)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const requestStartTime = Date.now();
  try {
    const { submissionId } = await params;
    const { studentReply, sessionId, qIdx } = await request.json();

    console.log(
      `📝 [SUBMISSION_PATCH] Update attempt | SubmissionId: ${submissionId} | Session: ${sessionId} | Question: ${qIdx}`
    );

    if (!studentReply) {
      return NextResponse.json(
        { error: "Student reply is required" },
        { status: 400 }
      );
    }

    // If sessionId and qIdx are provided, use them to find the submission
    // Otherwise use submissionId directly
    let data, error;

    if (sessionId !== undefined && qIdx !== undefined) {
      console.log(
        "Updating submission with student reply by sessionId and qIdx:",
        {
          sessionId,
          qIdx,
          studentReplyLength: studentReply.length,
        }
      );

      const result = await supabase
        .from("submissions")
        .update({
          student_reply: studentReply,
        })
        .eq("session_id", sessionId)
        .eq("q_idx", qIdx)
        .select()
        .single();

      data = result.data;
      error = result.error;
    } else {
      console.log("Updating submission with student reply by submissionId:", {
        submissionId,
        studentReplyLength: studentReply.length,
      });

      const result = await supabase
        .from("submissions")
        .update({
          student_reply: studentReply,
        })
        .eq("id", submissionId)
        .select()
        .single();

      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error("Error updating submission:", error);
      return NextResponse.json(
        { error: "Failed to update submission", details: error.message },
        { status: 500 }
      );
    }

    console.log("Submission updated successfully:", data);

    const requestDuration = Date.now() - requestStartTime;
    console.log(
      `⏱️  [PERFORMANCE] Submission PATCH completed in ${requestDuration}ms`
    );
    console.log(
      `✅ [SUCCESS] Submission updated | SubmissionId: ${submissionId}`
    );

    return NextResponse.json({
      success: true,
      submission: data,
    });
  } catch (error) {
    const requestDuration = Date.now() - requestStartTime;
    console.error("Submission update error:", error);
    console.error(
      `❌ [ERROR] Submission PATCH failed after ${requestDuration}ms | Error: ${
        (error as Error)?.message
      }`
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
