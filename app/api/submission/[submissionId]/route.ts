import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentUser } from "@clerk/nextjs/server";

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
    // Authentication check
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { submissionId } = await params;
    const { studentReply, sessionId, qIdx } = await request.json();

    if (!studentReply) {
      return NextResponse.json(
        { error: "Student reply is required" },
        { status: 400 }
      );
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
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
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
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
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
      console.error("Error updating submission:", error);
      return NextResponse.json(
        { error: "Failed to update submission" },
        { status: 500 }
      );
    }

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
