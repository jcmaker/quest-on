import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { length, isInternal, ts, examCode, questionId } = body;

    // Here you would insert into your database
    // For now, we'll just log to the server console
    console.log("[PASTE_LOG]", {
      timestamp: new Date(ts).toISOString(),
      isInternal,
      length,
      examCode,
      questionId,
      suspicious: !isInternal
    });

    // Example DB insertion (commented out):
    // await supabase.from('paste_logs').insert({ ... })

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error logging paste event:", error);
    return NextResponse.json({ success: false, error: "Failed to log event" }, { status: 500 });
  }
}

