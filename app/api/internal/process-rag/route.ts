import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { processMaterialRAG } from "@/lib/process-material-rag";
import { logError } from "@/lib/logger";

export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  // Authenticate via internal secret
  const secret = request.headers.get("x-internal-secret");
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    examId: string;
    materialsText: Array<{ url: string; text: string; fileName: string }>;
    userId: string;
    source: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { examId, materialsText, userId, source } = body;

  if (!examId || !Array.isArray(materialsText) || !userId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = getSupabaseServer();

  // Mark as processing
  await supabase
    .from("exams")
    .update({ rag_status: "processing" })
    .eq("id", examId);

  try {
    const results = await Promise.allSettled(
      materialsText.map((material, idx) =>
        processMaterialRAG(examId, material, idx, {
          route: "/api/internal/process-rag",
          userId,
          source,
        })
      )
    );

    const failed = results.filter((r) => r.status === "rejected");
    const totalChunks = results.reduce(
      (sum, r) => sum + (r.status === "fulfilled" ? r.value : 0),
      0
    );

    if (failed.length > 0 && failed.length === results.length) {
      // All failed
      await supabase
        .from("exams")
        .update({ rag_status: "failed" })
        .eq("id", examId);

      return NextResponse.json(
        { status: "failed", totalChunks: 0, failedCount: failed.length },
        { status: 500 }
      );
    }

    await supabase
      .from("exams")
      .update({ rag_status: "completed" })
      .eq("id", examId);

    return NextResponse.json({
      status: "completed",
      totalChunks,
      failedCount: failed.length,
    });
  } catch (error) {
    logError("[process-rag] Unexpected error", error, {
      path: "/api/internal/process-rag",
      user_id: userId,
      additionalData: { examId },
    });

    await supabase
      .from("exams")
      .update({ rag_status: "failed" })
      .eq("id", examId);

    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
