import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Update submission with student reply using sessionId and qIdx
export async function POST(request: NextRequest) {
  try {
    const { studentReply, sessionId, qIdx } = await request.json();

    if (!studentReply || !sessionId || qIdx === undefined) {
      return NextResponse.json(
        { error: "Student reply, sessionId, and qIdx are required" },
        { status: 400 }
      );
    }

    console.log("Updating submission with student reply:", {
      sessionId,
      qIdx,
      studentReplyLength: studentReply.length,
    });

    // Find and update the submission
    const { data, error } = await supabase
      .from("submissions")
      .update({
        student_reply: studentReply,
      })
      .eq("session_id", sessionId)
      .eq("q_idx", qIdx)
      .select()
      .single();

    if (error) {
      console.error("Error updating submission:", error);
      return NextResponse.json(
        { error: "Failed to update submission", details: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
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
