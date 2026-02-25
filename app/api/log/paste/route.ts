import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentUser } from "@clerk/nextjs/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    // Authentication check
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      length,
      pasted_text,
      paste_start,
      paste_end,
      answer_length_before,
      isInternal,
      ts,
      examCode,
      questionId,
      sessionId,
    } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Verify session ownership
    const { data: session } = await supabase
      .from("sessions")
      .select("id, student_id")
      .eq("id", sessionId)
      .single();

    if (!session || session.student_id !== user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const suspicious = !isInternal;
    const timestamp = new Date(ts);

    const { error: insertError } = await supabase.from("paste_logs").insert({
      session_id: sessionId,
      exam_code: examCode,
      question_id: questionId,
      length: length,
      pasted_text: pasted_text || null,
      paste_start: paste_start ?? null,
      paste_end: paste_end ?? null,
      answer_length_before: answer_length_before ?? null,
      is_internal: isInternal,
      suspicious: suspicious,
      timestamp: timestamp.toISOString(),
    });

    if (insertError) {
      console.error("Error inserting paste log:", insertError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error logging paste event:", error);
    return NextResponse.json(
      { success: false, error: "Failed to log event" },
      { status: 500 }
    );
  }
}
