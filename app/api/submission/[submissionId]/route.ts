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
  try {
    const { submissionId } = await params;
    const { studentReply, sessionId, qIdx } = await request.json();

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

    return NextResponse.json({
      success: true,
      submission: data,
    });
  } catch (error) {
    console.error("Submission update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
