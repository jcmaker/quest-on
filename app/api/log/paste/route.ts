import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
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

    const suspicious = !isInternal;
    const timestamp = new Date(ts);

    // Log to console
    console.log("[PASTE_LOG]", {
      timestamp: timestamp.toISOString(),
      isInternal,
      length,
      pasted_text: pasted_text ? `${pasted_text.substring(0, 50)}...` : null,
      paste_start,
      paste_end,
      answer_length_before,
      examCode,
      questionId,
      sessionId,
      suspicious,
    });

    // Insert into database
    if (sessionId) {
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
        // Don't fail the request if logging fails
      } else {
        console.log("✅ Paste log saved to database");
      }
    } else {
      console.warn("⚠️ No sessionId provided, skipping database insert");
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

